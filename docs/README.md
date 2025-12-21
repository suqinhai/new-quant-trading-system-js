# 量化交易系统开发与使用教程

## 目录

1. [项目概述](#1-项目概述)
2. [快速开始](#2-快速开始)
3. [系统架构](#3-系统架构)
4. [配置说明](#4-配置说明)
5. [策略开发](#5-策略开发)
6. [API参考](#6-api参考)
7. [运维部署](#7-运维部署)
8. [测试说明](#8-测试说明)
9. [常见问题](#9-常见问题)

---

## 1. 项目概述

### 1.1 简介

这是一个**工业级加密货币量化交易系统**，使用 Node.js 开发，具备以下核心特性：

- **多交易所支持**：Binance、OKX、Bybit
- **多策略并行**：SMA、RSI、MACD、布林带、网格、资金费率套利
- **完整风控体系**：8大风控模块，仓位控制、止损止盈、日亏损限制、黑天鹅保护、熔断器
- **智能订单执行**：500ms未成交自动撤单重下、限频处理、故障转移、TWAP算法
- **实时监控告警**：Telegram、邮件、钉钉、Prometheus/Grafana
- **专业回测引擎**：历史数据回测、策略优化、性能评估
- **生产级质量**：61.89% 测试覆盖率，审计日志，优雅关闭

### 1.2 技术栈

| 类别 | 技术 | 版本 |
|-----|------|------|
| 运行时 | Node.js | >= 20.0.0 |
| 模块系统 | ES Modules | Native |
| 交易所API | CCXT | ^4.2.0 |
| 实时通信 | WebSocket (ws) | ^8.16.0 |
| 数据库 | SQLite (sql.js / better-sqlite3) | ^1.13.0 |
| 缓存 | Redis (ioredis) | ^5.3.2 |
| 日志 | Winston / Pino | ^3.11.0 / ^10.1.0 |
| 监控 | Prometheus (prom-client) | ^15.1.0 |
| 进程管理 | PM2 | External |
| 测试框架 | Vitest | ^4.0.16 |
| 参数验证 | Zod | ^4.2.1 |
| 精度计算 | Decimal.js | ^10.4.3 |

### 1.3 项目结构

```
quant-trading-system/
├── src/                          # 源代码 (77个模块)
│   ├── main.js                   # CLI 入口
│   ├── index.js                  # TradingEngine 主类
│   │
│   ├── exchange/                 # 交易所模块
│   │   ├── BaseExchange.js       # 交易所基类
│   │   ├── BinanceExchange.js    # Binance 适配器
│   │   ├── OKXExchange.js        # OKX 适配器
│   │   ├── BybitExchange.js      # Bybit 适配器
│   │   └── ExchangeFactory.js    # 工厂模式
│   │
│   ├── strategies/               # 策略模块 (7个策略)
│   │   ├── BaseStrategy.js       # 策略基类
│   │   ├── SMAStrategy.js        # SMA 双均线策略
│   │   ├── RSIStrategy.js        # RSI 超买超卖策略
│   │   ├── MACDStrategy.js       # MACD 策略
│   │   ├── BollingerBandsStrategy.js  # 布林带策略
│   │   ├── GridStrategy.js       # 网格交易策略
│   │   └── FundingArbStrategy.js # 资金费率套利策略
│   │
│   ├── risk/                     # 风控系统 (8个模块)
│   │   ├── RiskManager.js        # 基础风控管理器
│   │   ├── RiskSystem.js         # 风控系统协调器
│   │   ├── PortfolioRiskManager.js   # 组合风险管理
│   │   ├── PositionCalculator.js     # 仓位计算器
│   │   ├── CircuitBreaker.js     # 熔断器
│   │   ├── BlackSwanProtector.js # 黑天鹅保护
│   │   ├── LiquidityRiskMonitor.js   # 流动性风险监控
│   │   └── MultiAccountRiskAggregator.js  # 多账户风险聚合
│   │
│   ├── executor/                 # 订单执行引擎
│   │   ├── orderExecutor.js      # 智能订单执行器
│   │   ├── ExchangeFailover.js   # 交易所故障转移
│   │   ├── ExecutionQualityMonitor.js  # 执行质量监控
│   │   └── NetworkPartitionHandler.js # 网络分区处理
│   │
│   ├── marketdata/               # 行情数据引擎
│   │   ├── MarketDataEngine.js   # 行情引擎
│   │   ├── DataAggregator.js     # 数据聚合器
│   │   └── server.js             # WebSocket 服务
│   │
│   ├── backtest/                 # 回测引擎
│   │   ├── BacktestEngine.js     # 回测核心引擎
│   │   ├── engine.js             # 回测运行器
│   │   └── runner.js             # 批量回测
│   │
│   ├── capital/                  # 资金管理
│   │   └── CapitalAllocator.js   # 资金分配器
│   │
│   ├── portfolio/                # 投资组合
│   │   └── PortfolioManager.js   # 组合管理器
│   │
│   ├── analytics/                # 分析模块
│   │   └── CorrelationAnalyzer.js  # 相关性分析
│   │
│   ├── database/                 # 数据持久化
│   │   ├── DatabaseManager.js    # 数据库管理
│   │   ├── TradeRepository.js    # 交易记录仓库
│   │   └── BackupManager.js      # 备份管理
│   │
│   ├── logger/                   # 日志告警
│   │   ├── AuditLogger.js        # 审计日志
│   │   ├── AlertManager.js       # 告警管理
│   │   ├── TelegramNotifier.js   # Telegram 通知
│   │   ├── PnLLogger.js          # 盈亏日志
│   │   └── MetricsExporter.js    # 指标导出
│   │
│   ├── logging/                  # 日志系统
│   │   └── Logger.js             # 日志器
│   │
│   ├── monitor/                  # 系统监控
│   │   ├── SystemMonitor.js      # 系统监控
│   │   ├── AlertManager.js       # 告警管理
│   │   └── server.js             # 监控服务
│   │
│   ├── monitoring/               # 性能监控
│   │   ├── MetricsCollector.js   # 指标收集
│   │   └── PerformanceMonitor.js # 性能监控
│   │
│   ├── middleware/               # 中间件
│   │   ├── healthCheck.js        # 健康检查
│   │   └── security.js           # 安全中间件
│   │
│   ├── lifecycle/                # 生命周期管理
│   │   └── GracefulShutdown.js   # 优雅关闭
│   │
│   ├── config/                   # 配置管理
│   │   └── ConfigManager.js      # 配置管理器
│   │
│   └── utils/                    # 工具函数
│       ├── helpers.js            # 通用工具
│       ├── indicators.js         # 技术指标
│       ├── validators.js         # 验证器
│       ├── crypto.js             # 加密工具
│       └── logger.js             # 日志工具
│
├── config/                       # 配置文件
│   ├── index.js                  # 配置加载器
│   └── default.js                # 默认配置
│
├── tests/                        # 测试用例
│   ├── unit/                     # 单元测试 (30+文件)
│   ├── integration/              # 集成测试
│   ├── benchmark/                # 性能基准测试
│   └── mocks/                    # Mock 工具
│
├── examples/                     # 示例代码
├── scripts/                      # 脚本工具
├── data/                         # 数据目录
├── logs/                         # 日志目录
├── docs/                         # 文档
├── .env.example                  # 环境变量模板
├── ecosystem.config.cjs          # PM2 配置
├── vitest.config.js              # 测试配置
└── package.json
```

### 1.4 生产就绪状态

| 指标 | 状态 | 详情 |
|------|------|------|
| 测试覆盖率 | ✅ 61.89% | 超过60%门槛 |
| 风控模块 | ✅ 84.56% | 高覆盖率 |
| 工具函数 | ✅ 88.91% | 高覆盖率 |
| 资金管理 | ✅ 91.88% | 高覆盖率 |
| 监控模块 | ✅ 90.51% | 高覆盖率 |

---

## 2. 快速开始

### 2.1 环境要求

- Node.js >= 20.0.0
- pnpm (推荐) 或 npm
- Redis (可选，用于实时数据缓存)

### 2.2 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd quant-trading-system

# 2. 安装依赖
pnpm install

# 3. 复制环境变量文件
cp .env.example .env

# 4. 编辑配置文件
# 修改 .env 文件，填入你的交易所 API 密钥
```

### 2.3 配置 API 密钥

编辑 `.env` 文件：

```bash
# Binance 配置 (推荐先使用测试网)
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
BINANCE_TESTNET=true

# OKX 配置
OKX_API_KEY=your_api_key
OKX_API_SECRET=your_api_secret
OKX_PASSPHRASE=your_passphrase
OKX_SANDBOX=true

# Bybit 配置
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
BYBIT_TESTNET=true
```

### 2.4 加密 API 密钥（推荐）

```bash
# 设置主密码
export MASTER_KEY="your_secure_master_password"

# 加密密钥
npm run keys:encrypt

# 验证加密
npm run keys:verify
```

### 2.5 运行系统

系统支持三种运行模式：

```bash
# 1. 回测模式 - 使用历史数据测试策略
npm run backtest

# 2. 影子模式 - 真实行情，模拟下单（推荐用于开发测试）
npm run shadow

# 3. 实盘模式 - 真实交易
npm run live

# 开发模式（自动重载）
npm run dev
```

### 2.6 运行示例

```bash
# 运行 SMA 策略示例
node examples/runSMAStrategy.js

# 运行回测示例
node examples/runBacktest.js
```

---

## 3. 系统架构

### 3.1 核心架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     TradingEngine (主引擎)                        │
│                      src/index.js                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌──────────┐       ┌─────────────┐      ┌───────────┐
   │ Exchange │       │ MarketData  │      │   Risk    │
   │ (交易所)  │       │ (行情引擎)  │      │  (风控)   │
   │          │       │             │      │ 8个模块   │
   └────┬─────┘       └──────┬──────┘      └─────┬─────┘
        │                    │                   │
        └────────────────────┼───────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌──────────┐       ┌───────────┐       ┌─────────────┐
   │ Strategy │       │ Executor  │       │   Monitor   │
   │ (7个策略) │       │(订单执行)  │       │ (监控告警)  │
   └──────────┘       └───────────┘       └─────────────┘
        │                    │                   │
        └────────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Database     │
                    │ (SQLite/Redis)  │
                    └─────────────────┘
```

### 3.2 数据流

```
行情数据 (WebSocket)
    ↓
MarketDataEngine (标准化处理 + Redis缓存)
    ↓
Strategy (策略计算 → 生成信号)
    ↓
RiskManager (8层风控检查)
    │
    ├── PositionCalculator (仓位计算)
    ├── CircuitBreaker (熔断检查)
    ├── BlackSwanProtector (黑天鹅检测)
    └── LiquidityRiskMonitor (流动性检查)
    ↓
OrderExecutor (智能执行 + TWAP)
    ↓
Exchange (提交订单)
    ↓
AuditLogger (审计记录) + Monitor (告警)
```

### 3.3 模块职责

| 模块 | 职责 | 文件数 |
|-----|------|--------|
| TradingEngine | 系统入口，协调各模块 | 2 |
| Exchange | 交易所API封装，统一接口 | 5 |
| MarketDataEngine | WebSocket行情订阅，数据聚合 | 3 |
| Strategy | 策略逻辑，信号生成 | 8 |
| RiskManager | 8层风险检查，仓位控制 | 9 |
| OrderExecutor | 智能下单，重试机制，TWAP | 4 |
| BacktestEngine | 历史回测，性能评估 | 3 |
| Capital | 资金分配，Kelly公式 | 1 |
| Portfolio | 组合管理，再平衡 | 1 |
| Database | 数据持久化，备份恢复 | 3 |
| Logger | 日志告警，审计追踪 | 5 |
| Monitor | 系统监控，指标导出 | 5 |
| Lifecycle | 优雅关闭，资源清理 | 1 |

---

## 4. 配置说明

### 4.1 配置加载顺序

```
config/default.js (默认配置)
    ↓
.env (环境变量覆盖)
    ↓
.keys.enc (加密密钥)
    ↓
自定义配置 (代码传入)
```

### 4.2 交易所配置

```javascript
// config/default.js
exchange: {
  default: 'binance',

  binance: {
    enabled: true,
    sandbox: false,        // 是否使用测试网
    timeout: 30000,        // API 超时 (ms)
    enableRateLimit: true, // 启用限速
    defaultType: 'spot',   // 默认交易类型: spot/future/swap
  },

  okx: {
    enabled: true,
    sandbox: false,
    timeout: 30000,
    defaultType: 'spot',
  },

  bybit: {
    enabled: true,
    testnet: false,
    timeout: 30000,
    defaultType: 'spot',
  },
}
```

### 4.3 风控配置

```javascript
risk: {
  enabled: true,

  // 仓位限制
  maxPositionRatio: 0.3,   // 单个持仓最大占比 30%
  maxPositions: 5,         // 最多 5 个持仓
  maxLeverage: 3,          // 最大杠杆 3 倍

  // 风险限制
  maxRiskPerTrade: 0.02,   // 单笔风险 2%
  maxDailyLoss: 1000,      // 日亏损限制 1000 USDT
  maxDrawdown: 0.2,        // 最大回撤 20%

  // 熔断器配置
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,   // 连续失败5次触发
    recoveryTime: 300000,  // 恢复时间 5 分钟
  },

  // 黑天鹅保护
  blackSwanProtection: {
    enabled: true,
    priceDropThreshold: 0.1,  // 价格下跌 10% 触发
    volumeSpikeMultiple: 5,   // 成交量 5 倍异常
  },

  // 止损止盈
  stopLoss: {
    enabled: true,
    defaultRatio: 0.02,    // 止损 2%
    trailingStop: true,    // 追踪止损
    trailingRatio: 0.015,  // 追踪回撤 1.5%
  },

  takeProfit: {
    enabled: true,
    defaultRatio: 0.04,    // 止盈 4%
  },

  // 黑/白名单
  blacklist: [],
  whitelist: [],
}
```

### 4.4 策略配置

```javascript
strategy: {
  default: 'sma',

  defaults: {
    timeframe: '1h',
    capitalRatio: 0.1,  // 使用 10% 资金
    stopLoss: 0.02,
    takeProfit: 0.04,
  },

  // SMA 策略参数
  sma: {
    fastPeriod: 10,
    slowPeriod: 20,
  },

  // RSI 策略参数
  rsi: {
    period: 14,
    overbought: 70,
    oversold: 30,
  },

  // MACD 策略参数
  macd: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  },

  // 布林带策略参数
  bollingerBands: {
    period: 20,
    stdDev: 2,
  },

  // 网格策略参数
  grid: {
    gridCount: 10,
    gridSpacing: 0.01,
  },

  // 资金费率套利参数
  fundingArb: {
    minRateDiff: 0.0001,
    maxPositionSize: 10000,
  },
}
```

### 4.5 订单执行配置

```javascript
executor: {
  maxRetries: 3,         // 最大重试次数
  retryDelay: 1000,      // 重试间隔 (ms)
  maxSlippage: 0.5,      // 最大滑点 0.5%
  orderTimeout: 30000,   // 订单超时 (ms)
  concurrency: 3,        // 并发订单数
  unfillTimeout: 500,    // 未成交超时取消 (ms)

  // TWAP 算法
  enableTWAP: true,
  twap: {
    splitThreshold: 10000,  // 超过 10000 USDT 启用
    splitCount: 5,          // 拆分 5 份
    splitInterval: 2000,    // 间隔 2 秒
  },

  // 故障转移
  failover: {
    enabled: true,
    exchanges: ['binance', 'okx', 'bybit'],
  },
}
```

### 4.6 监控告警配置

```javascript
// 环境变量配置
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
ALERT_EMAIL_TO=recipient@example.com

// Prometheus 监控
METRICS_PORT=9090
```

---

## 5. 策略开发

### 5.1 策略基类

所有策略继承自 `BaseStrategy`：

```javascript
import { BaseStrategy } from '../strategies/BaseStrategy.js';

class MyStrategy extends BaseStrategy {
  constructor(params) {
    super(params);
    this.name = 'MyStrategy';
  }

  // 初始化 (必须实现)
  async onInit() {
    await super.onInit();
    // 初始化逻辑
  }

  // 每根 K 线触发 (必须实现)
  async onTick(candle, history) {
    // candle: { timestamp, open, high, low, close, volume }
    // history: 历史 K 线数组

    // 策略逻辑...
  }

  // K 线更新事件 (可选)
  async onCandle(data) {
    await super.onCandle(data);
  }

  // Ticker 更新事件 (可选)
  async onTicker(data) {
    // 处理实时价格
  }

  // 资金费率更新 (可选)
  async onFundingRate(data) {
    // 处理资金费率
  }

  // 结束 (可选)
  async onFinish() {
    await super.onFinish();
  }
}
```

### 5.2 信号方法

```javascript
// 设置买入信号
this.setBuySignal('金叉形成');

// 设置卖出信号
this.setSellSignal('死叉形成');

// 清除信号
this.clearSignal();

// 获取当前信号
const signal = this.getSignal();
// { type: 'buy'|'sell', reason: string, timestamp: number }
```

### 5.3 交易方法

```javascript
// 买入
this.buy('BTC/USDT', 0.1, { price: 50000 });

// 卖出
this.sell('BTC/USDT', 0.1, { price: 51000 });

// 按百分比买入 (占可用资金的百分比)
this.buyPercent('BTC/USDT', 10);  // 用 10% 资金买入

// 平仓
this.closePosition('BTC/USDT');

// 获取持仓
const position = this.getPosition('BTC/USDT');

// 获取资金
const capital = this.getCapital();
const equity = this.getEquity();
```

### 5.4 完整策略示例

```javascript
import { BaseStrategy } from '../strategies/BaseStrategy.js';
import { SMA, RSI } from 'technicalindicators';

export class MyCustomStrategy extends BaseStrategy {
  constructor(params) {
    super(params);
    this.name = 'MyCustomStrategy';

    // 策略参数
    this.smaPeriod = params.smaPeriod || 20;
    this.rsiPeriod = params.rsiPeriod || 14;
    this.rsiOverbought = params.rsiOverbought || 70;
    this.rsiOversold = params.rsiOversold || 30;
  }

  async onInit() {
    await super.onInit();
    this.log(`初始化: SMA=${this.smaPeriod}, RSI=${this.rsiPeriod}`);
  }

  async onTick(candle, history) {
    // 需要足够的历史数据
    if (history.length < Math.max(this.smaPeriod, this.rsiPeriod)) {
      return;
    }

    // 提取收盘价
    const closes = history.map(h => h.close);

    // 计算 SMA
    const smaResult = SMA.calculate({
      period: this.smaPeriod,
      values: closes,
    });
    const sma = smaResult[smaResult.length - 1];

    // 计算 RSI
    const rsiResult = RSI.calculate({
      period: this.rsiPeriod,
      values: closes,
    });
    const rsi = rsiResult[rsiResult.length - 1];

    // 保存指标
    this.setIndicator('sma', sma);
    this.setIndicator('rsi', rsi);

    // 获取当前持仓
    const position = this.getPosition(candle.symbol);
    const hasPosition = position && position.amount > 0;

    // 策略逻辑
    if (!hasPosition) {
      // 买入条件: 价格在 SMA 上方 + RSI 超卖
      if (candle.close > sma && rsi < this.rsiOversold) {
        this.setBuySignal(`RSI ${rsi.toFixed(2)} 超卖反弹`);
        this.buyPercent(candle.symbol, 10);
      }
    } else {
      // 卖出条件: RSI 超买
      if (rsi > this.rsiOverbought) {
        this.setSellSignal(`RSI ${rsi.toFixed(2)} 超买`);
        this.closePosition(candle.symbol);
      }
    }
  }
}

export default MyCustomStrategy;
```

---

## 6. API参考

### 6.1 TradingEngine

```javascript
import { createEngine, TradingEngine } from './src/index.js';

// 创建引擎
const engine = createEngine(config);

// 生命周期
await engine.initialize();  // 初始化
await engine.start();       // 启动
await engine.stop();        // 停止 (优雅关闭)

// 策略管理
await engine.runStrategy(name, config);
await engine.stopStrategy(name);

// 事件监听
engine.on('initialized', callback);
engine.on('started', callback);
engine.on('stopped', callback);
engine.on('signalGenerated', ({ signal }) => {});
engine.on('signalRejected', ({ signal, reason }) => {});
engine.on('orderExecuted', ({ signal, result }) => {});
engine.on('error', (error) => {});
```

### 6.2 RiskManager (8层风控)

```javascript
import { RiskManager } from './src/risk/RiskManager.js';

const riskManager = new RiskManager(config);

// 检查订单
const check = riskManager.checkOrder({
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 50000,
  accountBalance: 100000,
});
// { allowed: boolean, reason: string }

// 记录交易
riskManager.recordTrade({ symbol, side, amount, price, pnl });

// 获取状态
riskManager.getState();
// { dailyPnL, openPositions, totalRisk, drawdown, ... }
```

### 6.3 OrderExecutor

```javascript
import { OrderExecutor } from './src/executor/orderExecutor.js';

const executor = new OrderExecutor(config);

// 执行订单 (带自动重试和500ms超时取消)
const result = await executor.executeOrder({
  exchangeId: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 50000,
  type: 'limit',
});

// TWAP 执行大单
await executor.executeTWAP({
  symbol: 'BTC/USDT',
  side: 'buy',
  totalAmount: 10,
  splits: 5,
  interval: 2000,
});
```

### 6.4 BacktestEngine

```javascript
import { BacktestEngine } from './src/backtest/index.js';
import { SMAStrategy } from './src/strategies/index.js';

const backtest = new BacktestEngine({
  initialCapital: 10000,
  commission: 0.001,
  slippage: 0.0005,
});

// 设置策略
const strategy = new SMAStrategy({ fastPeriod: 10, slowPeriod: 20 });
backtest.setStrategy(strategy);

// 运行回测
const results = await backtest.run();

// 结果包含
{
  initialCapital: 10000,
  finalCapital: 12500,
  totalReturn: 0.25,
  winRate: 0.55,
  maxDrawdown: 0.15,
  sharpeRatio: 1.5,
  profitFactor: 1.8,
  trades: [...],
}
```

---

## 7. 运维部署

### 7.1 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动所有服务
npm run pm2:start

# 启动影子模式策略 (6个策略)
npm run pm2:shadow

# 启动实盘策略 (6个策略)
npm run pm2:live

# 管理命令
npm run pm2:status    # 查看状态
npm run pm2:logs      # 查看日志
npm run pm2:stop      # 停止
npm run pm2:restart   # 重启
npm run pm2:reload    # 平滑重载
```

### 7.2 健康检查

系统提供健康检查端点：

```bash
# 存活检查
GET /live -> { status: 'alive' }

# 就绪检查
GET /ready -> { healthy: true, checks: {...} }

# 完整健康检查
GET /health -> { healthy: true, checks: {...}, timestamp: '...' }

# Prometheus 指标
GET /metrics -> # HELP trading_orders_total ...
```

### 7.3 Prometheus 指标

```
# 交易指标
trading_orders_total
trading_orders_filled
trading_pnl_total
trading_position_count
trading_daily_loss

# 系统指标
system_memory_usage_bytes
system_cpu_usage_percent
system_uptime_seconds

# 风控指标
risk_checks_total
risk_rejections_total
circuit_breaker_state
```

### 7.4 日志管理

```bash
logs/
├── trading.log         # 交易日志
├── strategy.log        # 策略日志
├── risk.log            # 风控日志
├── error.log           # 错误日志
├── audit/              # 审计日志 (不可篡改)
│   └── audit-*.jsonl   # JSON Lines 格式
└── combined.log        # 综合日志
```

---

## 8. 测试说明

### 8.1 测试覆盖率

当前测试覆盖率：**61.89%**

```
Statements   : 61.89% ( 6811/11005 )
Branches     : 56.63% ( 3596/6349 )
Functions    : 65.79% ( 1264/1921 )
Lines        : 61.65% ( 6556/10633 )
```

### 8.2 运行测试

```bash
# 运行所有测试
npm test

# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# 性能基准测试
npm run bench
npm run bench:order
npm run bench:executor
```

### 8.3 测试文件结构

```
tests/
├── unit/                    # 单元测试 (30+文件)
│   ├── riskManager.test.js
│   ├── strategies.test.js
│   ├── orderExecutor.test.js
│   ├── backtest.test.js
│   ├── circuitBreaker.test.js
│   └── ...
├── integration/             # 集成测试
│   └── tradingFlow.test.js
├── benchmark/               # 性能测试
│   ├── executor.bench.js
│   └── orderLatency.bench.js
└── mocks/                   # Mock 工具
    └── exchangeMock.js
```

---

## 9. 常见问题

### 9.1 安装问题

**Q: better-sqlite3 安装失败？**

```bash
# Windows
npm install --global windows-build-tools

# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential python3
```

**Q: Node.js 版本不对？**

```bash
# 使用 nvm 管理版本
nvm install 20
nvm use 20
```

### 9.2 连接问题

**Q: 交易所连接超时？**

- 检查网络是否需要代理
- 确认 API 密钥正确
- 检查交易所是否在维护

**Q: WebSocket 频繁断开？**

- 增加 `pingInterval` 和 `pongTimeout`
- 检查服务器网络稳定性

### 9.3 交易问题

**Q: 订单一直未成交？**

- 系统会在 500ms 后自动撤单重下
- 检查价格是否合理
- 确认账户余额充足

**Q: 风控拒绝订单？**

- 检查是否超过日亏损限制
- 确认持仓数量未超限
- 查看 `riskManager.getState()` 获取详情

### 9.4 策略问题

**Q: 策略不产生信号？**

- 确认历史数据足够（至少需要指标周期长度的数据）
- 检查策略参数是否合理
- 增加 `this.log()` 调试

**Q: 回测结果和实盘差异大？**

- 考虑滑点和手续费
- 实盘流动性可能不足
- 策略可能存在过拟合

---

## 附录 A: 命令速查

```bash
# 运行模式
npm run backtest           # 回测
npm run shadow             # 影子模式
npm run live               # 实盘
npm run dev                # 开发模式 (自动重载)

# 密钥管理
npm run keys:encrypt       # 加密密钥
npm run keys:decrypt       # 解密密钥
npm run keys:verify        # 验证密钥
npm run keys:generate      # 生成密钥
npm run keys:rotate        # 轮换密钥

# PM2 管理
npm run pm2:start          # 启动
npm run pm2:shadow         # 启动影子模式 (6策略)
npm run pm2:live           # 启动实盘 (6策略)
npm run pm2:stop           # 停止
npm run pm2:restart        # 重启
npm run pm2:reload         # 平滑重载
npm run pm2:logs           # 日志
npm run pm2:status         # 状态

# 数据下载
npm run download-data      # 下载历史数据
npm run download-history   # 下载历史K线

# 测试
npm test                   # 运行测试
npm run test:unit          # 单元测试
npm run test:integration   # 集成测试
npm run test:watch         # 监听模式
npm run test:coverage      # 覆盖率报告
npm run bench              # 性能测试

# 代码质量
npm run lint               # 检查代码
npm run lint:fix           # 修复代码
npm run ci                 # CI 检查 (lint + test)
npm run ci:full            # 完整 CI (lint + test + bench)
```

## 附录 B: 环境变量清单

| 变量 | 说明 | 默认值 |
|-----|------|--------|
| NODE_ENV | 运行环境 | development |
| MASTER_KEY | 加密主密码 | - |
| BINANCE_API_KEY | Binance API Key | - |
| BINANCE_API_SECRET | Binance Secret | - |
| BINANCE_TESTNET | 使用测试网 | true |
| OKX_API_KEY | OKX API Key | - |
| OKX_API_SECRET | OKX Secret | - |
| OKX_PASSPHRASE | OKX 密码 | - |
| OKX_SANDBOX | 使用沙盒 | true |
| BYBIT_API_KEY | Bybit API Key | - |
| BYBIT_API_SECRET | Bybit Secret | - |
| BYBIT_TESTNET | 使用测试网 | true |
| REDIS_HOST | Redis 主机 | 127.0.0.1 |
| REDIS_PORT | Redis 端口 | 6379 |
| TELEGRAM_BOT_TOKEN | Telegram Token | - |
| TELEGRAM_CHAT_ID | Telegram Chat | - |
| LOG_LEVEL | 日志级别 | info |
| METRICS_PORT | Prometheus 端口 | 9090 |
| DASHBOARD_PORT | 仪表盘端口 | 3000 |

## 附录 C: 内置策略参数

### SMA 策略 (双均线)
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| fastPeriod | 快线周期 | 10 |
| slowPeriod | 慢线周期 | 20 |

### RSI 策略
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| period | RSI 周期 | 14 |
| overbought | 超买阈值 | 70 |
| oversold | 超卖阈值 | 30 |

### MACD 策略
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| fastPeriod | 快线周期 | 12 |
| slowPeriod | 慢线周期 | 26 |
| signalPeriod | 信号线周期 | 9 |

### 布林带策略
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| period | 周期 | 20 |
| stdDev | 标准差倍数 | 2 |

### 网格策略
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| gridCount | 网格数量 | 10 |
| gridSpacing | 网格间距 | 0.01 (1%) |

### 资金费率套利策略
| 参数 | 说明 | 默认值 |
|-----|------|--------|
| minRateDiff | 最小费率差 | 0.0001 |
| maxPositionSize | 最大仓位 | 10000 USDT |

---

*文档版本: 2.0.0*
*最后更新: 2024-12-21*
*测试覆盖率: 61.89%*
