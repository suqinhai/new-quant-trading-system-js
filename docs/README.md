# Quant Trading System

工业级加密货币量化交易系统 / Industrial-grade Cryptocurrency Quantitative Trading System

## 功能特点

- **多策略支持**: 内置多种交易策略，可灵活组合
- **多交易所**: 支持 Binance、OKX、Bybit、Gate.io、Deribit、Bitget、KuCoin、Kraken 等主流交易所
- **实时/影子模式**: 支持实盘交易和影子模式测试
- **完善风控**: 止损止盈、仓位管理、熔断机制
- **回测系统**: 历史数据回测验证策略
- **PM2 部署**: 开箱即用的 PM2 配置

## 快速开始

```bash
# 安装依赖
pnpm install

# 影子模式测试
npm run shadow

# 实盘模式
npm run live

# 回测
npm run backtest

# PM2 启动所有策略
npm run pm2:start
```

## 策略列表

### 基础策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| SMA | 简单移动平均线交叉 | 趋势市场 |
| RSI | 相对强弱指标 | 超买超卖 |
| MACD | 指数平滑异同移动平均 | 趋势确认 |
| BollingerBands | 布林带策略 | 震荡市场 |
| Grid | 网格交易 | 震荡市场 |

### 波动率策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| ATRBreakout | ATR 波动突破 | 高波动市场 |
| BollingerWidth | 布林带宽度挤压 | 波动收缩后爆发 |
| VolatilityRegime | 波动率状态切换 | 自适应波动 |

### 高级策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| OrderFlow | 订单流/成交行为 | 短线交易 |
| MultiTimeframe | 多周期共振 | 趋势跟踪 |
| RegimeSwitching | 市场状态切换 | 自适应市场 |
| **WeightedCombo** | 加权组合策略 | 多策略融合 |
| **Adaptive** | 自适应参数策略 | 动态参数调整 |

### 横截面策略 (多币种)

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| MomentumRank | 动量排名策略 | 多币种轮动 |
| Rotation | 强弱轮动策略 | 行业/板块轮动 |
| FundingRateExtreme | 资金费率极值 | 逆向套利 |
| CrossExchangeSpread | 跨交易所价差 | 套利交易 |
| StatisticalArbitrage | 统计套利 | 配对交易/协整 |

### 因子投资策略 (Alpha Factory)

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **FactorInvesting** | 多因子打分排名 | 量化选币 |

**因子库包含**:
- 动量因子 (1d/7d/30d/风险调整)
- 波动率因子 (布林带宽度/ATR比值/挤压)
- 资金流向因子 (MFI/OBV/CMF)
- 换手率因子 (相对成交量/异常成交量)
- 资金费率因子 (极值信号/Z-Score)
- 大单因子 (净流入/买卖不平衡)

---

## 加权组合策略 (WeightedCombo)

### 概述

`WeightedComboStrategy` 是一个元策略，整合多个子策略信号，使用加权打分制决定交易。核心思想是：**综合多个策略观点，降低单一策略失效风险**。

### 核心功能

1. **策略打分制 (Signal Score)**: 每个子策略输出 0-1 分数
   - 0.0 = 强烈看空
   - 0.5 = 中性
   - 1.0 = 强烈看多

2. **策略权重动态调整**: 基于历史表现自动调整权重
   - 胜率高的策略权重增加
   - 胜率低的策略权重降低

3. **相关性限制**: 高相关策略自动降权
   - 避免信号过度集中
   - 提高组合多样性

4. **策略熔断机制**: 表现差时暂停策略
   - 连续亏损熔断
   - 最大回撤熔断
   - 自动冷却恢复

### 配置示例

```javascript
// config/default.js 中的配置
weightedCombo: {
  // 策略权重配置 (总和应为 1.0)
  strategyWeights: {
    SMA: 0.4,   // SMA 趋势策略权重 40%
    RSI: 0.2,   // RSI 超买超卖策略权重 20%
    MACD: 0.4,  // MACD 策略权重 40%
  },

  // 交易阈值
  buyThreshold: 0.7,   // 总分 >= 0.7 买入
  sellThreshold: 0.3,  // 总分 <= 0.3 卖出

  // 动态权重调整
  dynamicWeights: true,
  adjustmentFactor: 0.2,
  minWeight: 0.05,
  maxWeight: 0.6,

  // 相关性限制
  correlationLimit: true,
  maxCorrelation: 0.7,
  correlationMatrix: {
    'SMA-MACD': 0.6,
    'SMA-RSI': 0.3,
  },

  // 熔断机制
  circuitBreaker: true,
  consecutiveLossLimit: 5,
  maxDrawdownLimit: 0.15,
  coolingPeriod: 3600000,  // 1 小时
}
```

### 使用方式

```bash
# 影子模式运行
pm2 start ecosystem.config.cjs --only quant-shadow-combo

# 实盘模式运行
pm2 start ecosystem.config.cjs --only quant-live-combo

# 运行示例
node examples/runWeightedCombo.js
```

### 信号计算流程

```
┌─────────────────────────────────────────────────────────┐
│                    K 线数据输入                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
│ │   SMA   │  │   RSI   │  │  MACD   │  │ Bollinger   │  │
│ │ Score:  │  │ Score:  │  │ Score:  │  │ Score:      │  │
│ │  0.8    │  │  0.6    │  │  0.7    │  │  0.5        │  │
│ └────┬────┘  └────┬────┘  └────┬────┘  └─────┬───────┘  │
│      │            │            │              │          │
│      │            │            │              │          │
│      ▼            ▼            ▼              ▼          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │              SignalWeightingSystem                  │ │
│ │                                                     │ │
│ │  权重调整: SMA×0.4 + RSI×0.2 + MACD×0.4            │ │
│ │  相关性惩罚: SMA-MACD 相关性 0.6 → 降权            │ │
│ │  熔断检查: 无熔断策略                               │ │
│ │                                                     │ │
│ │  综合得分: 0.72                                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  得分 0.72 >= 买入阈值 0.7 → 发出买入信号               │
└─────────────────────────────────────────────────────────┘
```

### 与 RegimeSwitching 配合

`WeightedComboStrategy` 可以作为 `RegimeSwitchingStrategy` 的子策略使用：

```javascript
// 在 RegimeSwitching 的 regimeMap 中配置
regimeMap: {
  trending_up: {
    strategies: ['WeightedCombo', 'MultiTimeframe'],
    weights: { WeightedCombo: 0.6, MultiTimeframe: 0.4 },
  },
  ranging: {
    strategies: ['WeightedCombo'],
    weights: { WeightedCombo: 1.0 },
  },
}
```

---

## 因子投资策略 (Factor Investing)

### 概述

`FactorInvestingStrategy` 是一套完整的多因子投资系统，不是单一策略，而是一整套 **Alpha 工厂**。

核心思想: **横截面 + 因子 = 长期 Alpha 来源**

### 因子类别

| 类别 | 因子示例 | 方向 |
|------|----------|------|
| 动量 | Momentum_7d, Momentum_30d, RiskAdj_Momentum | 正向 |
| 波动率 | BB_Width, ATR_Ratio, Keltner_Squeeze | 负向 |
| 资金流 | MFI_14, OBV_Slope, CMF_20 | 正向 |
| 换手率 | Vol_MA_Ratio, Relative_Volume, Abnormal_Volume | 正向 |
| 资金费率 | Funding_Percentile, Funding_ZScore | 负向 |
| 大单 | LargeOrder_Imbalance, Whale_Activity | 正向 |

### 使用示例

```javascript
import {
  FactorInvestingStrategy,
  createFullRegistry,
  FactorCombiner,
} from './src/factors/index.js';

// 1. 创建因子投资策略
const strategy = new FactorInvestingStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', ...],
  factorConfig: {
    momentum: { enabled: true, totalWeight: 0.4 },
    volatility: { enabled: true, totalWeight: 0.15 },
    moneyFlow: { enabled: true, totalWeight: 0.25 },
    turnover: { enabled: true, totalWeight: 0.2 },
  },
  topN: 5,           // 做多 Top 5
  bottomN: 5,        // 做空 Bottom 5
  positionType: 'long_short',
  weightMethod: 'equal',
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天
});

// 2. 或直接使用因子库
const registry = createFullRegistry();
const factorValues = await registry.calculateBatch(
  ['Momentum_7d', 'MFI_14', 'BB_Width_20'],
  dataMap
);

const combiner = new FactorCombiner({ factorWeights: {...} });
const scores = combiner.calculateScores(factorValues, symbols);
const { long, short } = combiner.getTopBottomN(scores, 5, 5);
```

### 运行示例

```bash
# 运行因子投资示例
node examples/runFactorInvesting.js
```

详细文档: [docs/FACTOR_INVESTING.md](./docs/FACTOR_INVESTING.md)

---

## 自适应参数策略 (Adaptive Strategy)

### 概述

> **策略不变，参数是策略的一部分** — 这是专业量化 vs 普通量化的分水岭

`AdaptiveStrategy` 让指标参数随市场状态动态调整，而不是使用固定参数。

### 三大自适应机制

| 机制 | 驱动因素 | 调整逻辑 |
|------|----------|----------|
| **SMA 周期** | 波动率 | 高波动→短周期(快速响应)，低波动→长周期(减少噪音) |
| **RSI 阈值** | 市场状态 | 趋势市→宽阈值(25/75)，震荡市→窄阈值(35/65) |
| **布林带宽度** | ATR | ATR高→大标准差(2.5-3.0)，ATR低→小标准差(1.5-2.0) |

### 使用示例

```javascript
import { AdaptiveStrategy, AdaptiveMode } from './strategies/index.js';

const strategy = new AdaptiveStrategy({
  symbol: 'BTC/USDT',
  adaptiveMode: AdaptiveMode.FULL,  // 完全自适应
  smaBaseFast: 10,
  smaBaseSlow: 30,
  smaPeriodAdjustRange: 0.5,  // ±50% 调整范围
});
```

### 运行示例

```bash
node examples/runAdaptiveStrategy.js
```

详细文档: [docs/adaptive-strategy.md](./docs/adaptive-strategy.md)

---

## 项目结构

```
├── config/                 # 配置文件
│   └── default.js          # 默认配置
├── src/
│   ├── strategies/         # 策略实现
│   │   ├── BaseStrategy.js
│   │   ├── WeightedComboStrategy.js
│   │   ├── SignalWeightingSystem.js
│   │   ├── CrossSectionalStrategy.js   # 横截面策略基类
│   │   ├── StatisticalArbitrageStrategy.js
│   │   ├── AdaptiveStrategy.js         # 自适应参数策略
│   │   └── ...
│   ├── factors/            # Alpha 因子库
│   │   ├── BaseFactor.js              # 因子基类
│   │   ├── FactorRegistry.js          # 因子注册表
│   │   ├── FactorCombiner.js          # 因子组合器
│   │   ├── FactorInvestingStrategy.js # 因子投资策略
│   │   └── factors/                   # 具体因子
│   │       ├── MomentumFactor.js
│   │       ├── VolatilityFactor.js
│   │       ├── MoneyFlowFactor.js
│   │       ├── TurnoverFactor.js
│   │       ├── FundingRateFactor.js
│   │       └── LargeOrderFactor.js
│   ├── services/           # 核心服务
│   ├── utils/              # 工具函数
│   └── main.js             # 入口文件
├── tests/
│   ├── unit/               # 单元测试
│   └── integration/        # 集成测试
├── examples/               # 示例代码
│   ├── runWeightedCombo.js
│   ├── runFactorInvesting.js
│   └── runAdaptiveStrategy.js
├── docs/                   # 文档
│   ├── FACTOR_INVESTING.md           # 因子投资文档
│   ├── CROSS_SECTIONAL_STRATEGIES.md # 横截面策略文档
│   ├── STATISTICAL_ARBITRAGE.md      # 统计套利文档
│   └── adaptive-strategy.md          # 自适应参数策略文档
├── ecosystem.config.cjs    # PM2 配置
└── package.json
```

## 测试

### 测试概览

| 类别 | 文件数 | 测试用例 | 说明 |
|------|--------|----------|------|
| 单元测试 | 64 | ~3500+ | 模块级别测试 |
| 集成测试 | 7 | ~150+ | 模块间交互测试 |
| 端到端测试 | 10 | ~250+ | 全流程测试 |
| **总计** | **87** | **~4200+** | 覆盖率目标 60% |

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行集成测试
pnpm test:integration

# 测试覆盖率
pnpm test:coverage
```

## PM2 命令

```bash
# 启动所有策略
npm run pm2:start

# 仅启动影子模式
npm run pm2:shadow

# 仅启动实盘模式
npm run pm2:live

# 查看状态
npm run pm2:status

# 查看日志
npm run pm2:logs

# 停止所有
npm run pm2:stop
```

## 端口分配

| 策略 | HTTP | WS | Dashboard | Metrics |
|------|------|-----|-----------|---------|
| funding | 3000 | 3001 | 8080 | 9090 |
| grid | 3010 | 3011 | 8081 | 9091 |
| sma | 3020 | 3021 | 8082 | 9092 |
| rsi | 3030 | 3031 | 8083 | 9093 |
| macd | 3040 | 3041 | 8084 | 9094 |
| bb | 3050 | 3051 | 8085 | 9095 |
| atr | 3060 | 3061 | 8086 | 9096 |
| bbwidth | 3070 | 3071 | 8087 | 9097 |
| regime | 3080 | 3081 | 8088 | 9098 |
| orderflow | 3090 | 3091 | 8089 | 9099 |
| mtf | 3100 | 3101 | 8090 | 9100 |
| **combo** | 3110 | 3111 | 8091 | 9101 |

## 许可证

MIT
