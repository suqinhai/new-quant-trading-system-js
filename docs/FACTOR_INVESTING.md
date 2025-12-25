# Alpha 因子库 (Factor Investing)

## 概述

Alpha 因子库是一套完整的多因子投资系统，不是单一策略，而是一整套 **Alpha 工厂**。

### 核心价值

- **横截面 + 因子 = 长期 Alpha 来源**
- **非常适合自动化、规模化**
- **支持回测、实盘、多交易所**

## 因子列表

### 1. 动量因子 (Momentum)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| Momentum_1d | 1天收益率 | 正向 |
| Momentum_7d | 7天收益率 | 正向 |
| Momentum_30d | 30天收益率 | 正向 |
| RiskAdj_Momentum_7d | 7天风险调整动量 (类似夏普) | 正向 |
| Momentum_Accel_14d | 14天动量加速度 | 正向 |

### 2. 波动率收缩因子 (Volatility)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| BB_Width_20 | 布林带宽度 (20周期) | 负向 |
| ATR_Ratio | ATR/历史ATR 比值 | 负向 |
| Keltner_Squeeze | 肯特纳通道挤压程度 | 负向 |
| Vol_Percentile | 波动率历史百分位 | 负向 |

### 3. 资金流向因子 (Money Flow)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| MFI_14 | 资金流量指数 (14周期) | 正向 |
| OBV_Slope_20 | OBV 斜率 | 正向 |
| CMF_20 | Chaikin 资金流 | 正向 |
| Vol_Ratio_14 | 上涨/下跌成交量比 | 正向 |

### 4. 换手率因子 (Turnover)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| Vol_MA_Ratio_20 | 成交量/MA 比值 | 正向 |
| Vol_Rank_60 | 成交量百分位排名 | 正向 |
| Relative_Volume | 相对成交量 (近期/历史) | 正向 |
| Abnormal_Volume | 异常成交量 (Z-Score) | 正向 |

### 5. 资金费率极值因子 (Funding Rate)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| Funding_Current | 当前资金费率 | 负向 |
| Funding_Avg_7d | 7天平均费率 | 负向 |
| Funding_Percentile | 费率历史百分位 | 负向 |
| Funding_ZScore | 费率 Z-Score | 负向 |
| Funding_Extreme_Signal | 极值信号 (-1, 0, 1) | 负向 |

### 6. 大单成交占比因子 (Large Order)

| 因子名称 | 描述 | 方向 |
|---------|------|------|
| LargeOrder_Vol_Ratio | 大单成交量占比 | 正向 |
| LargeOrder_Net_Flow | 大单净流入 | 正向 |
| LargeOrder_Buy_Sell | 大单买卖比 | 正向 |
| Whale_Activity | 鲸鱼活动指数 | 正向 |
| LargeOrder_Imbalance | 大单买卖不平衡度 | 正向 |

## 快速开始

### 基础用法

```javascript
import {
  Momentum7D,
  FactorRegistry,
  FactorCombiner,
  FactorInvestingStrategy,
} from './src/factors/index.js';

// 1. 单因子计算
const momentum = await Momentum7D.calculate('BTC/USDT', { candles });
console.log(`7天动量: ${(momentum * 100).toFixed(2)}%`);

// 2. 多因子注册和批量计算
const registry = new FactorRegistry();
registry.register(Momentum7D);
registry.register(Momentum30D);
registry.register(MFI14);

const factorValues = await registry.calculateBatch(
  registry.getNames(),
  { 'BTC/USDT': { candles }, 'ETH/USDT': { candles } }
);

// 3. 因子组合和排名
const combiner = new FactorCombiner({
  factorWeights: {
    'Momentum_7d': 0.4,
    'Momentum_30d': 0.3,
    'MFI_14': 0.3,
  },
});

const scores = combiner.calculateScores(factorValues, symbols);
const rankings = combiner.generateRankings(scores, 'descending');

// 4. Top N / Bottom N 选择
const { long, short } = combiner.getTopBottomN(scores, 5, 5);
```

### 使用因子投资策略

```javascript
const strategy = new FactorInvestingStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', ...],

  // 因子配置
  factorConfig: {
    momentum: { enabled: true, totalWeight: 0.4 },
    volatility: { enabled: true, totalWeight: 0.15 },
    moneyFlow: { enabled: true, totalWeight: 0.25 },
    turnover: { enabled: true, totalWeight: 0.2 },
  },

  // 选股参数
  topN: 5,           // 做多 Top 5
  bottomN: 5,        // 做空 Bottom 5
  positionType: 'long_short',
  weightMethod: 'equal',

  // 再平衡
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天
});

await strategy.onInit();
```

## 架构设计

```
src/factors/
├── index.js                    # 统一导出
├── BaseFactor.js               # 因子基类
├── FactorRegistry.js           # 因子注册表
├── FactorCombiner.js           # 因子组合器
├── FactorInvestingStrategy.js  # 因子投资策略
└── factors/                    # 具体因子实现
    ├── MomentumFactor.js       # 动量因子
    ├── VolatilityFactor.js     # 波动率因子
    ├── MoneyFlowFactor.js      # 资金流向因子
    ├── TurnoverFactor.js       # 换手率因子
    ├── FundingRateFactor.js    # 资金费率因子
    └── LargeOrderFactor.js     # 大单因子
```

## 核心组件

### 1. BaseFactor (因子基类)

所有因子的基类，定义标准接口：

```javascript
class BaseFactor {
  async calculate(symbol, data, context)  // 计算单个资产
  async calculateBatch(dataMap, context)  // 批量计算
  normalizeZScore(values)                 // Z-Score 标准化
  normalizeMinMax(values)                 // Min-Max 标准化
  percentileRank(values)                  // 百分位排名
}
```

### 2. FactorRegistry (因子注册表)

管理所有因子的注册、获取和生命周期：

```javascript
registry.register(factor)              // 注册因子
registry.get('Momentum_7d')            // 获取因子
registry.getByCategory('momentum')     // 按类别获取
registry.calculateBatch(names, data)   // 批量计算
```

### 3. FactorCombiner (因子组合器)

多因子打分和排名系统：

```javascript
// 标准化方法
NORMALIZATION_METHOD = {
  ZSCORE,      // Z-Score
  MIN_MAX,     // 0-1 归一化
  PERCENTILE,  // 百分位
  RANK,        // 简单排名
  ROBUST,      // 稳健标准化 (中位数+IQR)
}

// 组合方法
COMBINATION_METHOD = {
  WEIGHTED_SUM,     // 加权求和
  WEIGHTED_AVERAGE, // 加权平均
  RANK_AVERAGE,     // 排名平均
  IC_WEIGHTED,      // IC 加权
  EQUAL,            // 等权重
}
```

### 4. FactorInvestingStrategy (因子投资策略)

完整的因子投资策略，支持：

- **仓位类型**: 只做多、只做空、多空对冲、市场中性
- **权重分配**: 等权重、得分加权、波动率平价
- **再平衡**: 定期再平衡，最小变化阈值

## 用法示例

### 示例 1: 动量选股

```javascript
import { Momentum30D, FactorCombiner } from './src/factors/index.js';

// 计算 30 天动量
const dataMap = {
  'BTC/USDT': { candles: btcCandles },
  'ETH/USDT': { candles: ethCandles },
  // ...
};

const values = await Momentum30D.calculateBatch(dataMap);

// 排名
const combiner = new FactorCombiner();
const scores = new Map(values);
const rankings = combiner.generateRankings(scores, 'descending');

// Top 3 做多
const topAssets = rankings.slice(0, 3);
console.log('做多:', topAssets.map(r => r.symbol));
```

### 示例 2: 多因子综合打分

```javascript
import {
  createFullRegistry,
  FactorCombiner,
  NORMALIZATION_METHOD,
} from './src/factors/index.js';

// 使用完整因子库
const registry = createFullRegistry();

// 计算所有因子
const factorValues = await registry.calculateBatch(
  ['Momentum_7d', 'Momentum_30d', 'MFI_14', 'BB_Width_20'],
  dataMap
);

// 创建组合器
const combiner = new FactorCombiner({
  factorWeights: {
    'Momentum_7d': 0.25,
    'Momentum_30d': 0.25,
    'MFI_14': 0.25,
    'BB_Width_20': 0.25,
  },
  normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
});

// 综合打分
const scores = combiner.calculateScores(factorValues, symbols);
const { long, short } = combiner.getTopBottomN(scores, 5, 5);
```

### 示例 3: 自定义因子

```javascript
import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION } from './src/factors/index.js';

class MyCustomFactor extends BaseFactor {
  constructor() {
    super({
      name: 'MyCustomFactor',
      category: FACTOR_CATEGORY.TECHNICAL,
      direction: FACTOR_DIRECTION.POSITIVE,
      description: '我的自定义因子',
    });
  }

  async calculate(symbol, data, context) {
    const { candles } = data;
    // 自定义计算逻辑
    const closes = candles.map(c => parseFloat(c.close));
    // ...
    return myFactorValue;
  }
}
```

## 最佳实践

### 1. 因子选择

- **避免因子高度相关**: 选择低相关因子组合
- **考虑因子衰减**: 定期检验因子有效性
- **多空平衡**: 市场中性策略降低 Beta 风险

### 2. 权重分配

- **初期使用等权重**: 简单且稳健
- **逐步引入 IC 加权**: 根据历史预测能力调整
- **限制单因子权重**: 避免过度依赖单一因子

### 3. 再平衡频率

- **日频**: 适合高流动性市场
- **周频**: 降低交易成本
- **月频**: 适合低频策略

### 4. 风险控制

- **单资产仓位限制**: 通常 10-20%
- **总仓位限制**: 100% 或更低
- **止损机制**: 结合横截面策略的风控模块

## 运行示例

```bash
# 运行因子投资示例
node examples/runFactorInvesting.js
```

## API 参考

详见各文件的 JSDoc 注释。

## 相关文档

- [横截面策略文档](./CROSS_SECTIONAL_STRATEGIES.md)
- [统计套利文档](./STATISTICAL_ARBITRAGE.md)
- [策略开发指南](./STRATEGY_DEVELOPMENT.md)
