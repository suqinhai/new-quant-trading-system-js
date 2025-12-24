# 用户使用手册

## 目录

1. [系统简介](#系统简介)
2. [快速开始](#快速开始)
3. [系统配置](#系统配置)
4. [运行模式](#运行模式)
5. [策略管理](#策略管理)
6. [交易操作](#交易操作)
7. [风控设置](#风控设置)
8. [监控告警](#监控告警)
9. [Web 界面](#web-界面)
10. [常见问题](#常见问题)

---

## 系统简介

本量化交易系统是一款专业级的自动化交易平台，支持主流加密货币交易所，提供完整的策略开发、回测、模拟和实盘交易功能。

### 核心功能

| 功能 | 描述 |
|------|------|
| 多交易所支持 | Binance、Bybit、OKX |
| 多策略运行 | 同时运行多个交易策略 |
| 专业回测 | 基于历史数据的策略验证 |
| 影子交易 | 实时行情下的模拟交易 |
| 实盘交易 | 真实资金自动化交易 |
| 风险管理 | 多层风控、止损保护 |
| 实时监控 | Telegram 告警、Web 仪表板 |

### 系统要求

- **操作系统**: Windows 10+、Linux、macOS
- **Node.js**: 18.0.0 或更高版本
- **内存**: 建议 4GB 以上
- **网络**: 稳定的互联网连接

---

## 快速开始

### 1. 安装系统

```bash
# 安装依赖
npm install
```

### 2. 配置交易所 API

创建 `.env` 文件，填入您的交易所 API 密钥：

```bash
# Binance
BINANCE_API_KEY=您的API密钥
BINANCE_SECRET=您的密钥

# Bybit
BYBIT_API_KEY=您的API密钥
BYBIT_SECRET=您的密钥

# OKX
OKX_API_KEY=您的API密钥
OKX_SECRET=您的密钥
OKX_PASSPHRASE=您的密码
```

### 3. 运行回测（推荐首次使用）

```bash
npm run backtest
```

### 4. 运行影子交易（模拟）

```bash
npm run shadow
```

### 5. 运行实盘交易

```bash
# 警告：实盘交易涉及真实资金，请谨慎操作
npm run live
```

---

## 系统配置

### 配置文件位置

```
config/
├── default.js      # 默认配置
├── production.js   # 生产环境配置
└── development.js  # 开发环境配置
```

### 主要配置项

#### 交易所配置

```javascript
exchanges: {
  binance: {
    enabled: true,
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    sandbox: false,  // true 使用测试网
    options: {
      defaultType: 'spot',  // 'spot' | 'future'
      adjustForTimeDifference: true
    }
  }
}
```

#### 策略配置

```javascript
strategies: {
  default: {
    symbol: 'BTC/USDT',
    timeframe: '1h',
    initialCapital: 10000,
    maxPositionSize: 0.1,  // 最大仓位 10%
    stopLoss: 0.02,        // 止损 2%
    takeProfit: 0.05       // 止盈 5%
  }
}
```

#### 风控配置

```javascript
risk: {
  maxDailyLoss: 0.05,       // 日最大亏损 5%
  maxDrawdown: 0.15,        // 最大回撤 15%
  maxPositionCount: 5,      // 最大持仓数
  maxLeverage: 3,           // 最大杠杆
  enableCircuitBreaker: true // 启用熔断
}
```

---

## 运行模式

### 回测模式 (Backtest)

使用历史数据验证策略表现。

```bash
npm run backtest
```

**配置参数：**
```javascript
backtest: {
  startDate: '2024-01-01',
  endDate: '2024-12-01',
  initialCapital: 10000,
  symbol: 'BTC/USDT',
  timeframe: '1h',
  commission: 0.001,  // 手续费 0.1%
  slippage: 0.0005    // 滑点 0.05%
}
```

**输出报告：**
- 总收益率
- 最大回撤
- 夏普比率
- 胜率
- 盈亏比
- 交易次数

### 影子交易模式 (Shadow)

使用实时行情，但不执行真实交易。

```bash
npm run shadow
```

**特点：**
- 实时行情数据
- 模拟订单执行
- 不消耗真实资金
- 完整的交易日志

**用途：**
- 策略实时验证
- 上线前测试
- 风险评估

### 实盘交易模式 (Live)

执行真实交易。

```bash
npm run live
```

**安全建议：**
1. 首次使用小资金测试
2. 设置合理的止损
3. 启用所有风控功能
4. 配置 Telegram 告警
5. 定期检查系统状态

---

## 策略管理

### 内置策略

| 策略名称 | 类型 | 描述 |
|----------|------|------|
| SMA | 趋势跟踪 | 双均线交叉策略 |
| RSI | 震荡 | 相对强度指标策略 |
| MACD | 趋势 | MACD 指标策略 |
| BollingerBands | 震荡 | 布林带策略 |
| ATRBreakout | 波动率 | ATR 动态通道突破策略 |
| BollingerWidth | 波动率 | 布林带宽度挤压突破策略 |
| VolatilityRegime | 波动率 | 波动率 Regime 切换策略 |
| Grid | 网格 | 网格交易策略 |
| FundingArb | 套利 | 资金费率套利策略 |

### 策略配置示例

#### SMA 策略

```javascript
{
  type: 'SMA',
  params: {
    shortPeriod: 10,   // 短期均线周期
    longPeriod: 30,    // 长期均线周期
    symbol: 'BTC/USDT',
    timeframe: '1h'
  }
}
```

#### RSI 策略

```javascript
{
  type: 'RSI',
  params: {
    period: 14,
    overbought: 70,    // 超买阈值
    oversold: 30,      // 超卖阈值
    symbol: 'ETH/USDT',
    timeframe: '4h'
  }
}
```

#### 网格策略

```javascript
{
  type: 'Grid',
  params: {
    upperPrice: 50000,  // 网格上限
    lowerPrice: 40000,  // 网格下限
    gridCount: 10,      // 网格数量
    totalAmount: 1000,  // 总投入金额
    symbol: 'BTC/USDT'
  }
}
```

#### ATR 突破策略 (波动率)

```javascript
{
  type: 'ATRBreakout',
  params: {
    atrPeriod: 14,          // ATR 周期
    atrMultiplier: 2.0,     // ATR 通道倍数
    baselinePeriod: 20,     // 基准线 EMA 周期
    useTrailingStop: true,  // 启用跟踪止损
    symbol: 'BTC/USDT',
    timeframe: '1h'
  }
}
```

#### 布林宽度挤压策略 (波动率)

```javascript
{
  type: 'BollingerWidth',
  params: {
    bbPeriod: 20,           // 布林带周期
    kcPeriod: 20,           // Keltner 通道周期
    squeezeThreshold: 20,   // 挤压阈值 (百分位)
    useMomentumConfirm: true,
    symbol: 'BTC/USDT',
    timeframe: '4h'
  }
}
```

#### 波动率 Regime 策略

```javascript
{
  type: 'VolatilityRegime',
  params: {
    lowVolThreshold: 25,    // 低波动阈值
    highVolThreshold: 75,   // 高波动阈值
    disableInExtreme: true, // 极端波动禁止交易
    symbol: 'BTC/USDT',
    timeframe: '1h'
  }
}
```

### 通过 API 管理策略

```bash
# 获取策略列表
curl http://localhost:3000/api/strategies

# 启动策略
curl -X POST http://localhost:3000/api/strategies/1/start

# 停止策略
curl -X POST http://localhost:3000/api/strategies/1/stop

# 创建新策略
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{"type": "SMA", "params": {...}}'
```

---

## 交易操作

### 订单类型

| 类型 | 说明 |
|------|------|
| MARKET | 市价单，立即成交 |
| LIMIT | 限价单，指定价格成交 |
| STOP_LOSS | 止损单 |

### 查看持仓

```bash
curl http://localhost:3000/api/positions
```

**返回示例：**
```json
{
  "positions": [
    {
      "symbol": "BTC/USDT",
      "side": "long",
      "size": 0.1,
      "entryPrice": 45000,
      "currentPrice": 46000,
      "unrealizedPnL": 100,
      "unrealizedPnLPercent": 2.22
    }
  ]
}
```

### 查看交易记录

```bash
curl http://localhost:3000/api/trades
```

### 手动平仓

```bash
curl -X POST http://localhost:3000/api/positions/close \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTC/USDT"}'
```

---

## 风控设置

### 风控层级

```
┌─────────────────────────────────────┐
│         熔断器 (Circuit Breaker)    │ ← 系统级保护
├─────────────────────────────────────┤
│      黑天鹅保护 (Black Swan)        │ ← 极端行情保护
├─────────────────────────────────────┤
│      组合风控 (Portfolio Risk)      │ ← 账户级风控
├─────────────────────────────────────┤
│      单笔风控 (Order Risk)          │ ← 订单级风控
└─────────────────────────────────────┘
```

### 风控规则配置

```javascript
risk: {
  // 单笔订单限制
  order: {
    maxSizePercent: 0.1,     // 单笔最大仓位 10%
    maxSlippage: 0.01        // 最大滑点 1%
  },

  // 账户级限制
  account: {
    maxPositionCount: 5,     // 最大持仓数
    maxTotalExposure: 0.5,   // 最大总敞口 50%
    maxDailyLoss: 0.05       // 日最大亏损 5%
  },

  // 熔断条件
  circuitBreaker: {
    enabled: true,
    triggerLoss: 0.1,        // 触发亏损 10%
    cooldownMinutes: 60      // 冷却时间 60 分钟
  }
}
```

### 查看风控状态

```bash
curl http://localhost:3000/api/risk/status
```

**返回示例：**
```json
{
  "status": "normal",
  "metrics": {
    "dailyPnL": -200,
    "dailyPnLPercent": -2,
    "totalExposure": 0.3,
    "positionCount": 2,
    "drawdown": 0.05
  },
  "alerts": [],
  "circuitBreaker": {
    "triggered": false,
    "lastTriggered": null
  }
}
```

---

## 监控告警

### Telegram 告警配置

1. 创建 Telegram Bot（通过 @BotFather）
2. 获取 Chat ID
3. 配置环境变量：

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 告警类型

| 类型 | 级别 | 触发条件 |
|------|------|----------|
| 订单成交 | INFO | 订单执行完成 |
| 仓位变动 | INFO | 开仓/平仓 |
| 风控警告 | WARNING | 接近风控阈值 |
| 熔断触发 | ERROR | 触发熔断条件 |
| 系统错误 | ERROR | 系统异常 |

### Prometheus 监控

访问 `http://localhost:9090/metrics` 获取系统指标。

**主要指标：**
- `trading_pnl_total` - 总盈亏
- `trading_orders_total` - 订单总数
- `trading_positions_count` - 当前持仓数
- `system_cpu_usage` - CPU 使用率
- `system_memory_usage` - 内存使用率

---

## Web 界面

### 访问仪表板

启动系统后访问：`http://localhost:3000`

### 功能模块

| 模块 | 功能 |
|------|------|
| 仪表板 | 系统概览、实时数据 |
| 策略管理 | 策略配置、启停控制 |
| 交易记录 | 历史交易查询 |
| 持仓管理 | 当前持仓、手动操作 |
| 风控配置 | 风控参数设置 |
| 系统设置 | 系统配置管理 |

### API 认证

系统使用 JWT 认证：

```bash
# 登录获取 Token
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# 使用 Token 访问 API
curl http://localhost:3000/api/strategies \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 常见问题

### Q: 如何更换交易对？

修改策略配置中的 `symbol` 参数：
```javascript
{
  symbol: 'ETH/USDT'  // 改为目标交易对
}
```

### Q: 回测结果和实盘差距大？

可能原因：
1. **滑点**：回测滑点设置过低
2. **流动性**：实际市场流动性不足
3. **延迟**：网络延迟影响执行价格
4. **手续费**：未正确计入手续费

建议：
- 增加回测滑点参数
- 使用影子模式验证
- 减小单笔交易量

### Q: 如何处理交易所连接失败？

1. 检查 API 密钥是否正确
2. 检查网络连接
3. 查看系统日志：`logs/` 目录
4. 联系交易所确认 API 状态

### Q: 如何紧急停止所有交易？

**方法一：通过 API**
```bash
curl -X POST http://localhost:3000/api/system/emergency-stop
```

**方法二：终止进程**
```bash
npm run pm2:stop
```

### Q: 系统崩溃后数据会丢失吗？

不会。系统使用多层数据持久化：
- SQLite：交易记录、订单历史
- Redis：实时状态、缓存数据
- ClickHouse：大数据归档

重启后系统会自动恢复状态。

### Q: 如何查看详细日志？

```bash
# 查看实时日志
tail -f logs/trading.log

# 查看错误日志
tail -f logs/error.log

# 查看 PnL 日志
tail -f logs/pnl/
```

---

## 安全建议

1. **API 密钥安全**
   - 使用只读密钥进行测试
   - 限制 API 权限（只开放必要权限）
   - 设置 IP 白名单

2. **资金安全**
   - 小资金起步
   - 设置合理止损
   - 定期提取利润

3. **系统安全**
   - 定期更新系统
   - 启用防火墙
   - 使用 HTTPS

4. **操作安全**
   - 保管好配置文件
   - 定期备份数据
   - 记录操作日志

---

## 技术支持

- **文档**：查看 `docs/` 目录下的其他文档
- **日志**：检查 `logs/` 目录下的日志文件
- **问题反馈**：提交 Issue 到项目仓库
