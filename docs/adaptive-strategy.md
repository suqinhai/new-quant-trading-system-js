# 自适应参数策略 (Adaptive Strategy)

## 核心理念

> **策略不变，参数是策略的一部分**
>
> 这是专业量化 vs 普通量化的分水岭

传统策略使用固定参数，而市场状态是变化的。自适应参数策略让参数随市场状态动态调整，从而在不同市场环境下都能保持较好的表现。

## 自适应机制

### 1. SMA 周期自适应（波动率驱动）

```
波动率高 (> 75%) → 短周期 (快速响应)
波动率低 (< 25%) → 长周期 (减少噪音)
```

**原理**：
- 高波动市场变化快，需要短周期来及时捕捉趋势变化
- 低波动市场噪音相对大，需要长周期来过滤假信号

**调整公式**：
```javascript
adjustedPeriod = basePeriod * (1 + adjustRange * (1 - volFactor * 2))
```

### 2. RSI 阈值自适应（市场状态驱动）

```
趋势市 (ADX > 25) → 宽阈值 (超卖 25, 超买 75)
震荡市 (ADX < 25) → 窄阈值 (超卖 35, 超买 65)
```

**原理**：
- 趋势市中，RSI 可以长期保持在超买/超卖区域，放宽阈值让趋势跑得更远
- 震荡市中，价格在区间内波动，收窄阈值更早捕捉反转

### 3. 布林带宽度自适应（ATR 驱动）

```
ATR 高位 (> 75%) → 大标准差 (2.5-3.0)
ATR 低位 (< 25%) → 小标准差 (1.5-2.0)
```

**原理**：
- ATR 高时波动大，扩大通道宽度减少假突破
- ATR 低时波动小，收窄通道更敏感地捕捉异常

## 信号融合机制

策略使用加权融合来综合多个指标的信号：

```javascript
// 根据市场状态调整权重
趋势市：SMA 权重 x 1.5，RSI 权重 x 0.8
震荡市：SMA 权重 x 0.7，RSI 权重 x 1.3，BB 权重 x 1.2
高波动：所有权重 x 0.8

// 计算融合信号
fusedSignal = Σ(signal_i * strength_i * weight_i) / Σweight_i

// 趋势过滤
顺势信号 x 1.2，逆势信号 x 0.7
```

## 使用方法

### 完全自适应模式

```javascript
import { AdaptiveStrategy, AdaptiveMode } from './strategies/AdaptiveStrategy.js';

const strategy = new AdaptiveStrategy({
  symbol: 'BTC/USDT',
  positionPercent: 95,

  // 启用所有自适应
  adaptiveMode: AdaptiveMode.FULL,
  enableSMAAdaptive: true,
  enableRSIAdaptive: true,
  enableBBAdaptive: true,

  // SMA 基准参数
  smaBaseFast: 10,
  smaBaseSlow: 30,
  smaPeriodAdjustRange: 0.5,  // ±50% 调整范围

  // RSI 自适应阈值
  rsiTrendingOversold: 25,
  rsiTrendingOverbought: 75,
  rsiRangingOversold: 35,
  rsiRangingOverbought: 65,

  // 布林带自适应范围
  bbMinStdDev: 1.5,
  bbMaxStdDev: 3.0,
});
```

### 单项自适应模式

```javascript
// 仅 SMA 周期自适应
const strategy = new AdaptiveStrategy({
  adaptiveMode: AdaptiveMode.SMA_ONLY,
  enableSMAAdaptive: true,
  enableRSIAdaptive: false,
  enableBBAdaptive: false,
});
```

### 自定义权重

```javascript
const strategy = new AdaptiveStrategy({
  // 信号权重
  smaWeight: 0.5,  // SMA 占 50%
  rsiWeight: 0.3,  // RSI 占 30%
  bbWeight: 0.2,   // BB 占 20%

  // 信号触发阈值
  signalThreshold: 0.5,  // 融合信号 > 0.5 才触发交易

  // 趋势过滤
  useTrendFilter: true,
  trendMAPeriod: 50,
});
```

## 参数说明

### 核心参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `adaptiveMode` | `FULL` | 自适应模式 (FULL/SMA_ONLY/RSI_ONLY/BB_ONLY) |
| `enableSMAAdaptive` | `true` | 是否启用 SMA 周期自适应 |
| `enableRSIAdaptive` | `true` | 是否启用 RSI 阈值自适应 |
| `enableBBAdaptive` | `true` | 是否启用布林带宽度自适应 |

### SMA 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `smaBaseFast` | `10` | 快线基准周期 |
| `smaBaseSlow` | `30` | 慢线基准周期 |
| `smaPeriodAdjustRange` | `0.5` | 周期调整范围 (±50%) |
| `smaVolLowThreshold` | `25` | 低波动阈值 (百分位) |
| `smaVolHighThreshold` | `75` | 高波动阈值 (百分位) |

### RSI 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `rsiPeriod` | `14` | RSI 周期 |
| `rsiBaseOversold` | `30` | 基准超卖阈值 |
| `rsiBaseOverbought` | `70` | 基准超买阈值 |
| `rsiTrendingOversold` | `25` | 趋势市超卖阈值 |
| `rsiTrendingOverbought` | `75` | 趋势市超买阈值 |
| `rsiRangingOversold` | `35` | 震荡市超卖阈值 |
| `rsiRangingOverbought` | `65` | 震荡市超买阈值 |

### 布林带参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `bbPeriod` | `20` | 布林带周期 |
| `bbBaseStdDev` | `2.0` | 基准标准差倍数 |
| `bbMinStdDev` | `1.5` | 最小标准差倍数 |
| `bbMaxStdDev` | `3.0` | 最大标准差倍数 |

### 信号融合参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `smaWeight` | `0.4` | SMA 信号权重 |
| `rsiWeight` | `0.3` | RSI 信号权重 |
| `bbWeight` | `0.3` | BB 信号权重 |
| `signalThreshold` | `0.5` | 信号触发阈值 |
| `useTrendFilter` | `true` | 是否使用趋势过滤 |
| `trendMAPeriod` | `50` | 趋势判断 MA 周期 |

## 运行示例

```bash
node examples/runAdaptiveStrategy.js
```

示例包含：
1. 完全自适应模式运行
2. 仅 SMA 自适应运行
3. 固定参数 vs 自适应参数对比
4. 参数变化监控

## API 方法

### getAdaptiveParams()

获取当前自适应参数：

```javascript
const params = strategy.getAdaptiveParams();
// {
//   smaFastPeriod: 8,
//   smaSlowPeriod: 24,
//   rsiOversold: 25,
//   rsiOverbought: 75,
//   bbStdDev: 2.3
// }
```

### getSignalHistory(limit)

获取信号历史：

```javascript
const history = strategy.getSignalHistory(50);
// [{ timestamp, signal, confidence, adaptiveParams, regime }, ...]
```

### getStats()

获取策略统计：

```javascript
const stats = strategy.getStats();
// {
//   currentRegime: 'trending_up',
//   regimeChanges: 5,
//   adaptiveParams: {...},
//   signals: { buy: 10, sell: 8, total: 100 }
// }
```

## 市场状态说明

| 状态 | 英文 | 特征 | 参数调整 |
|------|------|------|---------|
| 上涨趋势 | `trending_up` | ADX > 25, PDI > MDI | SMA 权重↑, RSI 阈值放宽 |
| 下跌趋势 | `trending_down` | ADX > 25, MDI > PDI | SMA 权重↑, RSI 阈值放宽 |
| 震荡盘整 | `ranging` | ADX < 25 | RSI/BB 权重↑, RSI 阈值收窄 |
| 高波动 | `high_volatility` | 波动率 > 75% | 所有权重↓, BB 通道放宽 |
| 极端情况 | `extreme` | 波动率 > 95% | 停止交易 |

## 注意事项

1. **数据需求**：策略需要足够的历史数据来计算波动率百分位，建议至少 200 根 K 线
2. **参数调优**：基准参数仍需要根据具体市场调优，自适应只是在此基础上动态调整
3. **过拟合风险**：自适应机制本身也可能过拟合，建议在多个市场环境下测试
4. **极端情况**：在极端市场状态下，策略会自动停止交易以保护资金

## 与其他策略的对比

| 特性 | 固定参数策略 | 自适应参数策略 |
|------|-------------|---------------|
| 参数数量 | 少 | 多 (但更灵活) |
| 市场适应性 | 单一市场最优 | 多种市场都能工作 |
| 回测表现 | 可能更好 (过拟合) | 更稳健 |
| 实盘表现 | 可能较差 | 更稳定 |
| 复杂度 | 低 | 中 |

## 扩展建议

1. **添加更多自适应因子**：如成交量、市场深度等
2. **机器学习优化**：使用 ML 来学习最优的参数映射函数
3. **多品种参数共享**：利用跨品种信息来提高参数稳定性
4. **在线学习**：实盘中持续更新参数映射关系
