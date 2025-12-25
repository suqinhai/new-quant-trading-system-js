# 风控驱动策略 (Risk-Driven Strategy)

## 核心理念

> **用风控当交易信号，而不是止损**
>
> 这是生存优先的交易哲学

传统风控是被动的保护机制（止损），而风控驱动策略将风控指标作为**主动的交易信号源**。当风险指标发出警告时，不是简单地止损，而是主动调整仓位以适应市场状态。

## 核心机制

### 1. 波动率突破 → 强制降仓

```
当前波动率 > 历史波动率 × 2.0 → 强制减仓 50%
```

**原理**：
- 波动率突破意味着市场进入非正常状态
- 高波动时期持有大仓位风险极高
- 主动降仓而不是等待止损触发

### 2. 账户回撤 > X → 动态减仓/策略切换

```
回撤 > 10% (预警)   → 减仓至 80%
回撤 > 15% (警告)   → 减仓至 50%
回撤 > 20% (严重)   → 减仓至 10%
回撤 > 25% (紧急)   → 强制清仓
```

**原理**：
- 回撤是风险的真实体现
- 越接近临界点，越需要激进减仓
- 保护本金是第一优先级

### 3. 相关性骤升 → 减少多策略叠加

```
相关性骤升 > 1.5x 历史均值 → 减少整体暴露 30%
```

**原理**：
- 市场危机时相关性趋向于 1
- 看似分散的策略可能同时亏损
- 在相关性升高时主动减少暴露

## 高级形态

### Target Volatility（目标波动率）

动态调整仓位，使组合波动率维持在目标值：

```
目标仓位 = 目标波动率 / 当前波动率
```

**示例**：
- 目标波动率：15%/年
- 当前波动率：30%/年
- 建议仓位：50%

### Risk Parity（风险平价）

让各资产贡献相等的风险：

```
资产权重 ∝ 1 / 资产波动率
```

**原理**：
- 高波动资产分配较少资金
- 低波动资产分配较多资金
- 实现真正的风险分散

### Max Drawdown Control（最大回撤控制）

根据当前回撤状态动态调整仓位：

```javascript
if (回撤 < 5%)  仓位 = 100%
if (回撤 < 10%) 仓位 = 80%
if (回撤 < 15%) 仓位 = 50%
if (回撤 < 20%) 仓位 = 10%
if (回撤 >= 25%) 强制清仓
```

## 使用方法

### 基础用法

```javascript
import { RiskDrivenStrategy, RiskMode } from './strategies/RiskDrivenStrategy.js';

const strategy = new RiskDrivenStrategy({
  symbol: 'BTC/USDT',
  positionPercent: 95,

  // 风控模式
  riskMode: RiskMode.COMBINED,  // 组合所有模式

  // 目标波动率
  targetVolatility: 0.15,       // 15%年化

  // 最大回撤
  maxDrawdown: 0.15,            // 15%
  warningDrawdown: 0.10,        // 10%预警
  criticalDrawdown: 0.20,       // 20%严重
  emergencyDrawdown: 0.25,      // 25%紧急
});
```

### 目标波动率模式

```javascript
const strategy = new RiskDrivenStrategy({
  riskMode: RiskMode.TARGET_VOLATILITY,

  targetVolatility: 0.12,           // 目标年化波动率 12%
  volatilityLookback: 20,           // 波动率计算周期
  volatilityAdjustSpeed: 0.3,       // 调整速度
  minPositionRatio: 0.1,            // 最小仓位 10%
  maxPositionRatio: 1.5,            // 最大仓位 150%
});
```

### 最大回撤控制模式

```javascript
const strategy = new RiskDrivenStrategy({
  riskMode: RiskMode.MAX_DRAWDOWN,

  maxDrawdown: 0.15,
  warningDrawdown: 0.10,
  criticalDrawdown: 0.20,
  emergencyDrawdown: 0.25,
  drawdownReduceSpeed: 0.5,
});
```

### 波动率突破模式

```javascript
const strategy = new RiskDrivenStrategy({
  riskMode: RiskMode.VOLATILITY_BREAKOUT,

  volatilityBreakoutThreshold: 2.0, // 2倍突破
  volatilityBreakoutLookback: 60,   // 60周期历史
  forceReduceRatio: 0.5,            // 突破时减半
});
```

### 风险平价模式（多资产）

```javascript
const strategy = new RiskDrivenStrategy({
  riskMode: RiskMode.RISK_PARITY,

  assets: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  riskParityRebalanceThreshold: 0.1, // 10%偏离再平衡
  correlationLookback: 30,
});
```

### 组合模式

```javascript
const strategy = new RiskDrivenStrategy({
  riskMode: RiskMode.COMBINED,  // 启用所有风控模式

  // 目标波动率
  targetVolatility: 0.15,

  // 最大回撤
  maxDrawdown: 0.15,
  warningDrawdown: 0.10,

  // 波动率突破
  volatilityBreakoutThreshold: 2.0,
  forceReduceRatio: 0.5,

  // 相关性监控
  correlationThreshold: 0.8,
  correlationSpikeMultiplier: 1.5,
});
```

## 参数说明

### 风控模式

| 参数 | 值 | 说明 |
|------|------|------|
| `riskMode` | `TARGET_VOLATILITY` | 目标波动率模式 |
| | `RISK_PARITY` | 风险平价模式 |
| | `MAX_DRAWDOWN` | 最大回撤控制模式 |
| | `VOLATILITY_BREAKOUT` | 波动率突破模式 |
| | `CORRELATION_MONITOR` | 相关性监控模式 |
| | `COMBINED` | 组合所有模式 |

### 目标波动率参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `targetVolatility` | `0.15` | 目标年化波动率 (15%) |
| `volatilityLookback` | `20` | 波动率计算周期 |
| `volatilityAdjustSpeed` | `0.3` | 调整速度 (0-1) |
| `minPositionRatio` | `0.1` | 最小仓位比例 (10%) |
| `maxPositionRatio` | `1.5` | 最大仓位比例 (150%) |

### 回撤控制参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `maxDrawdown` | `0.15` | 最大回撤阈值 (15%) |
| `warningDrawdown` | `0.10` | 预警阈值 (10%) |
| `criticalDrawdown` | `0.20` | 严重阈值 (20%) |
| `emergencyDrawdown` | `0.25` | 紧急阈值 (25%) |
| `drawdownReduceSpeed` | `0.5` | 减仓速度 |

### 波动率突破参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `volatilityBreakoutThreshold` | `2.0` | 突破倍数 |
| `volatilityBreakoutLookback` | `60` | 历史参考周期 |
| `forceReduceRatio` | `0.5` | 强制减仓比例 |

### 相关性监控参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `correlationThreshold` | `0.8` | 高相关性阈值 |
| `correlationSpikeMultiplier` | `1.5` | 骤升倍数 |
| `correlationLookback` | `30` | 计算周期 |

### 风险平价参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `riskParityRebalanceThreshold` | `0.1` | 再平衡阈值 |
| `targetRiskContribution` | `equal` | 目标风险贡献 |

## 风险等级

| 等级 | 英文 | 说明 | 建议仓位 |
|------|------|------|---------|
| 安全 | `safe` | 所有指标正常 | 100% |
| 正常 | `normal` | 略有波动 | 80% |
| 升高 | `elevated` | 需要关注 | 50-80% |
| 高 | `high` | 需要减仓 | 30% |
| 严重 | `critical` | 只平不开 | 10% |
| 紧急 | `emergency` | 强制清仓 | 0% |

## API 方法

### getRiskStatus()

获取当前风险状态：

```javascript
const status = strategy.getRiskStatus();
// {
//   level: 'elevated',
//   positionRatio: 0.65,
//   isLowRiskMode: false,
//   drawdown: {
//     current: 0.08,
//     max: 0.12,
//     riskLevel: 'elevated',
//     recoveryProgress: 92
//   },
//   volatility: {
//     current: 0.23,
//     percentile: 75
//   }
// }
```

### getEventHistory(limit)

获取风控事件历史：

```javascript
const events = strategy.getEventHistory(20);
// [
//   { type: 'volatility_spike', timestamp: ..., ... },
//   { type: 'position_reduced', timestamp: ..., ... },
//   ...
// ]
```

### forceRiskAssessment()

手动触发风险评估：

```javascript
const assessment = strategy.forceRiskAssessment();
// {
//   overallLevel: 'elevated',
//   signals: [...],
//   actions: [...],
//   metrics: {...}
// }
```

### setTargetVolatility(target)

动态设置目标波动率：

```javascript
strategy.setTargetVolatility(0.12);  // 设为 12%
```

### setMaxDrawdown(threshold)

动态设置最大回撤阈值：

```javascript
strategy.setMaxDrawdown(0.10);  // 设为 10%
```

### getStats()

获取策略统计：

```javascript
const stats = strategy.getStats();
// {
//   riskLevel: 'normal',
//   positionRatio: 0.85,
//   isLowRiskMode: false,
//   totalEvents: 15,
//   recentEvents: [...],
//   volatility: 0.18,
//   drawdown: {...},
//   targetVolState: {...}
// }
```

## 风控事件类型

| 事件 | 说明 |
|------|------|
| `volatility_spike` | 波动率突破 |
| `drawdown_warning` | 回撤预警 |
| `drawdown_breach` | 回撤突破 |
| `correlation_surge` | 相关性骤升 |
| `risk_level_change` | 风险等级变化 |
| `position_reduced` | 仓位减少 |
| `forced_liquidation` | 强制清仓 |
| `strategy_switch` | 策略切换 |

## 事件监听

```javascript
strategy.on('riskEvent', (event) => {
  console.log(`风控事件: ${event.type}`);

  if (event.type === 'forced_liquidation') {
    // 紧急通知
    sendAlert('紧急清仓触发！');
  }
});
```

## 回测示例

```javascript
import { BacktestEngine } from './core/BacktestEngine.js';
import { RiskDrivenStrategy, RiskMode } from './strategies/RiskDrivenStrategy.js';

const strategy = new RiskDrivenStrategy({
  symbol: 'BTC/USDT',
  riskMode: RiskMode.COMBINED,
  targetVolatility: 0.15,
  maxDrawdown: 0.15,
});

const engine = new BacktestEngine({
  strategy,
  symbol: 'BTC/USDT',
  timeframe: '1h',
  startDate: '2024-01-01',
  endDate: '2024-12-01',
  initialCapital: 10000,
});

const result = await engine.run();
console.log(`最大回撤: ${(result.maxDrawdown * 100).toFixed(1)}%`);
console.log(`风控事件: ${strategy.getEventHistory().length}`);
```

## 与传统止损的对比

| 特性 | 传统止损 | 风控驱动策略 |
|------|---------|-------------|
| 触发方式 | 被动（价格触发） | 主动（风险指标） |
| 减仓方式 | 全部平仓 | 渐进式减仓 |
| 信号来源 | 价格 | 波动率/回撤/相关性 |
| 恢复机制 | 无 | 风险降低后自动恢复 |
| 策略切换 | 无 | 支持自动切换 |
| 多资产支持 | 单独控制 | 统一风险管理 |

## 最佳实践

### 1. 参数设置建议

```javascript
// 保守型
{
  targetVolatility: 0.10,     // 10%目标波动率
  maxDrawdown: 0.10,          // 10%最大回撤
  volatilityBreakoutThreshold: 1.5,
}

// 平衡型
{
  targetVolatility: 0.15,     // 15%目标波动率
  maxDrawdown: 0.15,          // 15%最大回撤
  volatilityBreakoutThreshold: 2.0,
}

// 激进型
{
  targetVolatility: 0.25,     // 25%目标波动率
  maxDrawdown: 0.20,          // 20%最大回撤
  volatilityBreakoutThreshold: 2.5,
}
```

### 2. 多策略组合

```javascript
// 主策略 + 风控驱动
const mainStrategy = new MomentumStrategy(...);
const riskStrategy = new RiskDrivenStrategy({
  riskMode: RiskMode.MAX_DRAWDOWN,
  lowRiskStrategy: mainStrategy,  // 关联主策略
  enableStrategySwitching: true,
});
```

### 3. 实时监控

```javascript
// 定期检查风险状态
setInterval(() => {
  const status = strategy.getRiskStatus();

  if (status.level === 'high' || status.level === 'critical') {
    console.warn(`警告: 风险等级 ${status.level}`);
    sendNotification(status);
  }
}, 60000);  // 每分钟检查
```

## 注意事项

1. **数据需求**：策略需要足够的历史数据来计算波动率和相关性，建议至少 100 根 K 线
2. **冷却期**：仓位调整有 1 分钟冷却期，避免频繁操作（紧急情况除外）
3. **渐进调整**：仓位恢复是渐进的（每次最多 10%），不会一次性加满
4. **多资产要求**：风险平价和相关性监控需要配置多个资产才能生效
5. **回测验证**：建议在不同市场环境下进行充分的回测验证

## 直接提升生存率

风控驱动策略的核心价值：

```
生存 > 盈利
```

在极端市场中（如 2020 年 3 月、2022 年 Luna 崩盘），风控驱动策略能够：

- 提前识别波动率异常
- 在回撤扩大前主动减仓
- 避免在高相关性时期过度暴露
- 在最坏的情况下保护本金

**记住：活着才能继续交易。**
