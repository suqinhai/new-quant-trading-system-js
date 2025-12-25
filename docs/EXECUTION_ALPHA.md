# 执行 Alpha (Execution Alpha)

## 概述

执行 Alpha 是一套订单执行优化系统，通过智能执行策略来减少市场冲击和滑点，从执行层面获取额外收益。

### 核心价值

- **减少滑点**: 通过智能拆单减少市场冲击
- **优化执行**: 根据市场状况自适应调整执行策略
- **降低成本**: 规避高滑点时段，选择最佳执行时机
- **量化监控**: 记录并分析执行质量，持续优化

### 适用场景

| 场景 | 说明 |
|------|------|
| 大单执行 | 订单占日均量 1% 以上 |
| 低流动性市场 | 盘口深度不足以支撑直接成交 |
| 高波动时段 | 市场波动剧烈，滑点风险高 |
| 批量调仓 | 多资产同时调整仓位 |

## 模块组成

```
src/executor/executionAlpha/
├── ExecutionAlphaEngine.js    # 执行 Alpha 引擎（统一入口）
├── OrderBookAnalyzer.js       # 盘口深度分析器
├── TWAPVWAPExecutor.js        # TWAP/VWAP 执行器
├── IcebergOrderExecutor.js    # 冰山单执行器
├── SlippageAnalyzer.js        # 滑点分析器
└── index.js                   # 模块导出
```

## 快速开始

### 1. 使用统一入口

```javascript
import { createExecutionAlphaEngine } from './src/executor/executionAlpha/index.js';

// 创建引擎
const engine = createExecutionAlphaEngine({
  verbose: true,
  enableAutoDelay: true,
});

// 更新市场数据
engine.updateMarketData('BTC/USDT', {
  orderBook,
  trades,
  candles,
  dailyVolume: 1000,
});

// 分析订单
const analysis = engine.analyzeOrder({
  symbol: 'BTC/USDT',
  side: 'buy',
  size: 5.0,
  urgency: 0.5,
});

console.log(`推荐策略: ${analysis.recommendedStrategy}`);
console.log(`预估滑点: ${(analysis.estimatedSlippage * 100).toFixed(4)}%`);
```

### 2. 快速分析

```javascript
import { quickAnalyze } from './src/executor/executionAlpha/index.js';

// 快速评估订单执行可行性
const result = quickAnalyze(orderBook, 'BTC/USDT', 'buy', 3.0);

console.log(`流动性等级: ${result.liquidityAssessment.level}`);
console.log(`冲击等级: ${result.impactEstimation.impactLevel}`);
console.log(`建议: ${result.recommendation}`);
```

## 核心组件详解

### 1. 盘口分析器 (OrderBookAnalyzer)

分析盘口深度、流动性和市场冲击成本。

```javascript
import { OrderBookAnalyzer, LIQUIDITY_LEVEL } from './src/executor/executionAlpha/index.js';

const analyzer = new OrderBookAnalyzer({
  depthLevels: 20,           // 分析深度层数
  imbalanceThreshold: 0.3,   // 不平衡阈值
});

// 分析盘口深度
const depth = analyzer.analyzeDepth(orderBook, 'BTC/USDT');
console.log(`买盘深度: ${depth.bidDepth}`);
console.log(`卖盘深度: ${depth.askDepth}`);
console.log(`买卖比: ${depth.bidAskRatio}`);
console.log(`压力方向: ${depth.pressure}`);

// 评估流动性
const liquidity = analyzer.assessLiquidity('BTC/USDT', 2.0, depth);
console.log(`流动性等级: ${liquidity.level}`);
// 可能的值: very_high, high, medium, low, very_low

// 估算冲击成本
const impact = analyzer.estimateImpactCost('BTC/USDT', 'buy', 5.0, orderBook);
console.log(`预估滑点: ${impact.estimatedSlippage}`);
console.log(`冲击等级: ${impact.impactLevel}`);
// 可能的值: minimal, low, medium, high, extreme
```

**流动性等级说明：**

| 等级 | 可执行比例 | 建议 |
|------|-----------|------|
| very_high | > 90% | 可直接执行 |
| high | 70-90% | 可直接执行 |
| medium | 50-70% | 考虑 TWAP |
| low | 30-50% | 建议 VWAP/冰山单 |
| very_low | < 30% | 强烈建议冰山单 |

### 2. TWAP/VWAP 执行器 (TWAPVWAPExecutor)

时间加权和成交量加权执行算法。

```javascript
import {
  TWAPVWAPExecutor,
  ALGO_TYPE,
  VOLUME_CURVES
} from './src/executor/executionAlpha/index.js';

const executor = new TWAPVWAPExecutor({
  defaultAlgo: ALGO_TYPE.ADAPTIVE,
  minSliceInterval: 5000,    // 最小间隔 5秒
  maxSliceInterval: 300000,  // 最大间隔 5分钟
});

// 创建 TWAP 计划
const twapPlan = executor.createExecutionPlan({
  symbol: 'BTC/USDT',
  side: 'buy',
  totalSize: 10.0,
  algo: ALGO_TYPE.TWAP,
  duration: 60 * 60 * 1000,   // 1小时
  sliceCount: 20,
  randomize: true,            // 随机化
  randomRange: 0.2,           // ±20%
});

// 创建 VWAP 计划
const vwapPlan = executor.createExecutionPlan({
  symbol: 'BTC/USDT',
  side: 'buy',
  totalSize: 10.0,
  algo: ALGO_TYPE.VWAP,
  duration: 60 * 60 * 1000,
  sliceCount: 12,
  volumeCurve: VOLUME_CURVES.U_SHAPED,
  historicalVolume: candles.map(c => c.volume),
});
```

**算法类型：**

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| TWAP | 时间均匀分布 | 无明显成交量规律 |
| VWAP | 跟随历史成交量 | 希望减少对价格影响 |
| ADAPTIVE | 自适应调整 | 不确定市场状况 |

**成交量曲线：**

| 曲线 | 说明 |
|------|------|
| UNIFORM | 均匀分布 |
| U_SHAPED | U型 (两端多，中间少) |
| FRONT_LOADED | 前重后轻 |
| BACK_LOADED | 前轻后重 |

### 3. 冰山单执行器 (IcebergOrderExecutor)

隐藏大单真实意图，减少市场冲击。

```javascript
import {
  IcebergOrderExecutor,
  SPLIT_STRATEGY,
  DISPLAY_MODE,
} from './src/executor/executionAlpha/index.js';

const executor = new IcebergOrderExecutor({
  defaultSplitStrategy: SPLIT_STRATEGY.ADAPTIVE,
  defaultDisplayMode: DISPLAY_MODE.DYNAMIC,
  minSplitCount: 5,
  maxSplitCount: 50,
  randomizationRange: 0.2,
});

// 创建冰山单计划
const plan = executor.createIcebergPlan({
  symbol: 'BTC/USDT',
  side: 'buy',
  totalSize: 20.0,
  splitStrategy: SPLIT_STRATEGY.ADAPTIVE,
  displayMode: DISPLAY_MODE.DYNAMIC,
  orderBook,
  avgDailyVolume: 1000,
});

console.log(`拆分份数: ${plan.splits.length}`);
plan.splits.forEach((split, i) => {
  console.log(`第 ${i+1} 片: 显示 ${split.displaySize} / 实际 ${split.actualSize}`);
});
```

**拆分策略：**

| 策略 | 说明 |
|------|------|
| LINEAR | 等分 |
| RANDOM | 随机大小 |
| ADAPTIVE | 根据盘口自适应 |
| VOLUME_BASED | 基于历史成交量 |

**显示模式：**

| 模式 | 说明 |
|------|------|
| FIXED | 固定显示量 |
| RANDOM | 随机显示量 |
| DYNAMIC | 动态调整 |

### 4. 滑点分析器 (SlippageAnalyzer)

分析和预测滑点风险。

```javascript
import {
  SlippageAnalyzer,
  SLIPPAGE_RISK,
  PERIOD_TYPE,
} from './src/executor/executionAlpha/index.js';

const analyzer = new SlippageAnalyzer({
  lookbackPeriod: 100,
  warningThreshold: 0.005,   // 0.5% 预警
  criticalThreshold: 0.01,   // 1% 严重
});

// 分析当前时段风险
const periodRisk = analyzer.analyzePeriodRisk('BTC/USDT');
console.log(`时段类型: ${periodRisk.periodType}`);
console.log(`风险等级: ${periodRisk.riskLevel}`);
console.log(`建议延迟: ${periodRisk.suggestDelay}`);

// 记录历史滑点
analyzer.recordSlippage('BTC/USDT', {
  expectedPrice: 50000,
  actualPrice: 50025,
  size: 1.0,
  side: 'buy',
  timestamp: Date.now(),
});

// 获取统计
const stats = analyzer.getSlippageStats('BTC/USDT');
console.log(`平均滑点: ${stats.averageSlippage}`);
console.log(`最大滑点: ${stats.maxSlippage}`);

// 预测滑点
const prediction = analyzer.predictSlippage('BTC/USDT', 'buy', 2.0);
console.log(`预期滑点: ${prediction.expectedSlippage}`);
console.log(`置信区间: ${prediction.confidenceInterval}`);
```

**高风险时段（UTC）：**

| 时段 | 原因 |
|------|------|
| 00:00 | 资金费率结算 |
| 08:00 | 资金费率结算 |
| 16:00 | 资金费率结算 |
| 整点前后 | 大量定时策略触发 |

## 执行 Alpha 引擎

统一入口，整合所有组件。

### 订单分析

```javascript
const engine = createExecutionAlphaEngine();

const analysis = engine.analyzeOrder({
  symbol: 'BTC/USDT',
  side: 'buy',
  size: 5.0,
  urgency: 0.5,  // 0-1, 越高越紧急
});

// 返回结果
{
  sizeClass: 'medium',              // 订单大小分类
  recommendedStrategy: 'twap',      // 推荐策略
  liquidityLevel: 'medium',         // 流动性等级
  slippageRisk: 'medium',           // 滑点风险
  estimatedSlippage: 0.0015,        // 预估滑点
  suggestSplit: true,               // 是否建议拆分
  strategyScores: {                 // 各策略得分
    direct: 0.3,
    twap: 0.8,
    vwap: 0.75,
    iceberg: 0.6,
    adaptive: 0.85,
  },
}
```

### 订单大小分类

| 分类 | 日均量占比 | 说明 |
|------|-----------|------|
| tiny | < 0.1% | 极小单，直接执行 |
| small | 0.1% - 0.5% | 小单，可直接执行 |
| medium | 0.5% - 2% | 中单，考虑 TWAP |
| large | 2% - 5% | 大单，建议拆分 |
| very_large | > 5% | 超大单，必须冰山 |

### 生成执行计划

```javascript
const plan = engine.generateExecutionPlan({
  symbol: 'BTC/USDT',
  side: 'buy',
  size: 10.0,
  strategy: 'auto',  // 自动选择
  duration: 60 * 60 * 1000,
});

// 返回结果
{
  strategy: 'twap',
  steps: [...],
  estimatedDuration: 3600000,
  estimatedSlippageSaving: 0.003,
}
```

## 配置说明

### 默认配置

在 `config/default.js` 中配置：

```javascript
executor: {
  executionAlpha: {
    enabled: true,

    // 订单大小分类阈值
    sizeClassThresholds: {
      tiny: 0.001,      // 0.1%
      small: 0.005,     // 0.5%
      medium: 0.02,     // 2%
      large: 0.05,      // 5%
    },

    // 策略选择权重
    strategyWeights: {
      liquidity: 0.3,
      slippageRisk: 0.3,
      urgency: 0.2,
      orderSize: 0.2,
    },

    // 自动策略阈值
    autoStrategyThresholds: {
      minSizeForAlgo: 0.01,
      minSizeForIceberg: 0.02,
    },

    // TWAP 默认配置
    defaultTWAPDuration: 30 * 60 * 1000,
    defaultSliceCount: 20,

    // 开关
    enableAutoDelay: true,
    enableSlippageRecording: true,
    verbose: false,

    // 盘口分析器配置
    orderBookAnalyzer: {
      depthLevels: 20,
      liquidityThresholds: {
        veryLow: 0.1,
        low: 0.3,
        medium: 0.6,
        high: 0.9,
      },
    },

    // 滑点分析器配置
    slippageAnalyzer: {
      lookbackPeriod: 100,
      highRiskHours: [0, 8, 16],
      warningThreshold: 0.005,
      criticalThreshold: 0.01,
    },

    // 冰山单配置
    iceberg: {
      defaultSplitStrategy: 'adaptive',
      defaultDisplayMode: 'dynamic',
      minSplitCount: 5,
      maxSplitCount: 50,
      randomizationRange: 0.2,
    },

    // TWAP/VWAP 配置
    twapVwap: {
      defaultAlgo: 'adaptive',
      minSliceInterval: 5000,
      maxSliceInterval: 300000,
      useMarketConditionAdjust: true,
      defaultVolumeCurve: 'u_shaped',
    },
  },
}
```

## 执行质量监控

### 记录执行结果

```javascript
engine.recordExecution('BTC/USDT', {
  expectedPrice: 50000,
  actualPrice: 50010,
  size: 1.0,
  side: 'buy',
  strategy: 'twap',
  timestamp: Date.now(),
});
```

### 获取执行统计

```javascript
const stats = engine.getExecutionStats('BTC/USDT');

console.log(`总执行次数: ${stats.totalExecutions}`);
console.log(`平均滑点: ${stats.averageSlippage}`);
console.log(`最佳策略: ${stats.bestStrategy}`);

// 各策略表现
stats.byStrategy.forEach((data, strategy) => {
  console.log(`${strategy}: 平均滑点 ${data.avgSlippage}`);
});
```

## 最佳实践

### 1. 大单执行建议

```javascript
// 订单 > 日均量 2% 时
if (analysis.sizeClass === 'large' || analysis.sizeClass === 'very_large') {
  // 使用冰山单 + TWAP 组合
  const plan = engine.generateExecutionPlan({
    symbol,
    side,
    size,
    strategy: 'iceberg',
    duration: 60 * 60 * 1000,  // 延长执行时间
  });
}
```

### 2. 规避高风险时段

```javascript
const periodRisk = slippageAnalyzer.analyzePeriodRisk(symbol);

if (periodRisk.suggestDelay) {
  // 延迟到低风险时段
  const delay = periodRisk.suggestedDelay;
  setTimeout(() => executeOrder(), delay);
}
```

### 3. 流动性检查

```javascript
const liquidity = orderBookAnalyzer.assessLiquidity(symbol, size, depth);

if (liquidity.level === 'very_low') {
  // 分多次执行
  const splitCount = liquidity.suggestedSplits;
  // ...
}
```

### 4. 动态调整

```javascript
// 执行过程中监控滑点
engine.on('slippage_warning', (data) => {
  if (data.currentSlippage > threshold) {
    // 暂停执行
    engine.pauseExecution(data.executionId);
    // 等待市场恢复
  }
});
```

## 常见问题

### Q: 什么时候使用 TWAP vs VWAP?

- **TWAP**: 市场成交量分布均匀，或需要稳定节奏执行
- **VWAP**: 希望跟随市场节奏，减少价格影响

### Q: 冰山单的隐藏比例设多少合适?

一般建议 70-90% 隐藏。根据流动性调整：
- 高流动性: 可降低到 50-70%
- 低流动性: 建议 80-95%

### Q: 如何处理极端市场情况?

```javascript
const analysis = engine.analyzeOrder({ symbol, side, size });

if (analysis.slippageRisk === 'extreme') {
  // 1. 延迟执行
  // 2. 大幅减小单笔大小
  // 3. 或暂停交易
}
```

## 运行示例

```bash
node examples/runExecutionAlpha.js
```

## API 参考

详见 [API_REFERENCE.md](./API_REFERENCE.md#执行-alpha-模块)
