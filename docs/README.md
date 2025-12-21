# 量化交易系统开发与使用教程

## 目录

1. [项目概述](#1-项目概述)
2. [快速开始](#2-快速开始)
3. [系统架构](#3-系统架构)
4. [配置说明](#4-配置说明)
5. [策略开发](#5-策略开发)
6. [API参考](#6-api参考)
7. [运维部署](#7-运维部署)
8. [常见问题](#8-常见问题)

---

## 1. 项目概述

### 1.1 简介

这是一个**工业级加密货币量化交易系统**，使用 Node.js 开发，具备以下核心特性：

- **多交易所支持**：Binance、OKX、Bybit
- **多策略并行**：SMA、RSI、MACD、布林带、网格、资金费率套利
- **完整风控体系**：仓位控制、止损止盈、日亏损限制、黑天鹅保护
- **智能订单执行**：500ms未成交自动撤单重下、限频处理、故障转移
- **实时监控告警**：Telegram、邮件、钉钉、Prometheus/Grafana
- **专业回测引擎**：历史数据回测、策略优化、性能评估

### 1.2 技术栈

| 类别 | 技术 |
|-----|------|
| 运行时 | Node.js >= 20.0.0 |
| 交易所API | CCXT |
| 实时通信 | WebSocket (ws) |
| 数据库 | SQLite / Redis |
| 日志 | Winston / Pino |
| 监控 | Prometheus + Grafana |
| 进程管理 | PM2 |

### 1.3 项目结构

```
quant-trading-system/
├── src/
│   ├── main.js              # CLI 入口
│   ├── index.js             # TradingEngine 主类
│   ├── exchange/            # 交易所模块
│   │   ├── BaseExchange.js
│   │   ├── BinanceExchange.js
│   │   ├── OKXExchange.js
│   │   ├── BybitExchange.js
│   │   └── ExchangeFactory.js
│   ├── strategies/          # 策略模块
│   │   ├── BaseStrategy.js
│   │   ├── SMAStrategy.js
│   │   ├── RSIStrategy.js
│   │   ├── MACDStrategy.js
│   │   ├── BollingerBandsStrategy.js
│   │   ├── GridStrategy.js
│   │   └── FundingArbStrategy.js
│   ├── executor/            # 订单执行
│   │   ├── orderExecutor.js
│   │   └── ExchangeFailover.js
│   ├── risk/                # 风控系统
│   │   ├── RiskManager.js
│   │   ├── PortfolioRiskManager.js
│   │   └── PositionCalculator.js
│   ├── marketdata/          # 行情引擎
│   │   └── MarketDataEngine.js
│   ├── backtest/            # 回测引擎
│   │   ├── BacktestEngine.js
│   │   └── BacktestRunner.js
│   ├── logger/              # 日志告警
│   │   ├── TelegramNotifier.js
│   │   └── AlertManager.js
│   ├── monitor/             # 系统监控
│   │   └── SystemMonitor.js
│   └── utils/               # 工具函数
│       ├── helpers.js
│       ├── indicators.js
│       └── crypto.js
├── config/
│   ├── index.js             # 配置加载器
│   └── default.js           # 默认配置
├── examples/                # 示例代码
├── scripts/                 # 脚本工具
├── data/                    # 数据目录
├── logs/                    # 日志目录
├── tests/                   # 测试用例
├── .env.example             # 环境变量模板
├── ecosystem.config.cjs     # PM2 配置
└── package.json
```

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
┌─────────────────────────────────────────────────────────────┐
│                     TradingEngine (主引擎)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐  ┌─────────────┐  ┌──────────┐
   │ Exchange│  │ MarketData  │  │   Risk   │
   │ (交易所) │  │ (行情引擎)  │  │ (风控)   │
   └────┬────┘  └──────┬──────┘  └────┬─────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌─────────────┐
   │Strategy │  │ Executor │  │   Monitor   │
   │ (策略)  │  │(订单执行) │  │ (监控告警)  │
   └─────────┘  └──────────┘  └─────────────┘
```

### 3.2 数据流

```
行情数据 (WebSocket)
    ↓
MarketDataEngine (标准化处理)
    ↓
Strategy (策略计算 → 生成信号)
    ↓
RiskManager (风控检查)
    ↓
OrderExecutor (智能执行)
    ↓
Exchange (提交订单)
    ↓
Monitor (记录 & 告警)
```

### 3.3 模块职责

| 模块 | 职责 |
|-----|------|
| TradingEngine | 系统入口，协调各模块 |
| Exchange | 交易所API封装，统一接口 |
| MarketDataEngine | WebSocket行情订阅，数据聚合 |
| Strategy | 策略逻辑，信号生成 |
| RiskManager | 风险检查，仓位控制 |
| OrderExecutor | 智能下单，重试机制 |
| BacktestEngine | 历史回测，性能评估 |
| Monitor | 系统监控，告警通知 |

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
    partialTakeProfit: false,
    partialRatios: [0.5, 0.3, 0.2],
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

  // TWAP 算法
  enableTWAP: true,
  twap: {
    splitThreshold: 10000,  // 超过 10000 USDT 启用
    splitCount: 5,          // 拆分 5 份
    splitInterval: 2000,    // 间隔 2 秒
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

### 5.4 状态和指标

```javascript
// 设置/获取自定义状态
this.setState('lastCross', Date.now());
const lastCross = this.getState('lastCross');

// 设置/获取指标值
this.setIndicator('sma10', 50000);
const sma10 = this.getIndicator('sma10');
```

### 5.5 完整策略示例

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
        this.setBuySignal(`价格 ${candle.close} > SMA ${sma.toFixed(2)}, RSI ${rsi.toFixed(2)} < ${this.rsiOversold}`);
        this.buyPercent(candle.symbol, 10);  // 用 10% 资金买入
      }
    } else {
      // 卖出条件: 价格跌破 SMA 或 RSI 超买
      if (candle.close < sma || rsi > this.rsiOverbought) {
        this.setSellSignal(`价格 ${candle.close} < SMA ${sma.toFixed(2)} 或 RSI ${rsi.toFixed(2)} > ${this.rsiOverbought}`);
        this.closePosition(candle.symbol);
      }
    }
  }
}

export default MyCustomStrategy;
```

### 5.6 注册策略

将策略添加到 `src/strategies/index.js`：

```javascript
import { MyCustomStrategy } from './MyCustomStrategy.js';

// 添加到导出
export { MyCustomStrategy };

// 添加到注册表
StrategyRegistry.register('mycustom', MyCustomStrategy);
```

### 5.7 运行策略

```javascript
import { createEngine } from './src/index.js';

const engine = createEngine({
  exchange: { default: 'binance', binance: { sandbox: true } },
  risk: { maxPositionRatio: 0.1 },
});

await engine.start();

// 运行自定义策略
await engine.runStrategy('mycustom', {
  symbols: ['BTC/USDT', 'ETH/USDT'],
  timeframe: '1h',
  smaPeriod: 20,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
});
```

---

## 6. API参考

### 6.1 TradingEngine

```javascript
import { createEngine, TradingEngine } from './src/index.js';

// 创建引擎
const engine = createEngine(config);
// 或
const engine = new TradingEngine(config);

// 生命周期
await engine.initialize();  // 初始化
await engine.start();       // 启动
await engine.stop();        // 停止

// 策略管理
await engine.runStrategy(name, config);   // 运行策略
await engine.stopStrategy(name);          // 停止策略

// 状态查询
engine.getStatus();         // 获取引擎状态
engine.getAccountInfo();    // 获取账户信息

// 事件监听
engine.on('initialized', callback);
engine.on('started', callback);
engine.on('stopped', callback);
engine.on('strategyStarted', ({ name, config }) => {});
engine.on('strategyStopped', ({ name }) => {});
engine.on('signalGenerated', ({ signal }) => {});
engine.on('signalRejected', ({ signal, reason }) => {});
engine.on('orderExecuted', ({ signal, result }) => {});
engine.on('error', (error) => {});
```

### 6.2 Exchange

```javascript
import { ExchangeFactory } from './src/exchange/ExchangeFactory.js';

// 创建交易所实例
const exchange = ExchangeFactory.create('binance', config);

// 连接
await exchange.connect();
await exchange.loadMarkets();

// 账户
await exchange.fetchBalance();
await exchange.fetchPositions();

// 行情
await exchange.fetchTicker('BTC/USDT');
await exchange.fetchOrderBook('BTC/USDT');
await exchange.fetchTrades('BTC/USDT');
await exchange.fetchOHLCV('BTC/USDT', '1h');

// 交易
await exchange.createOrder(symbol, type, side, amount, price);
await exchange.cancelOrder(symbol, orderId);
await exchange.fetchOrder(symbol, orderId);
await exchange.fetchOpenOrders(symbol);
await exchange.fetchClosedOrders(symbol);

// 合约
await exchange.setLeverage(leverage, symbol);
await exchange.fetchFundingRate(symbol);

// 精度
exchange.getPrecision(symbol);  // { amount, price }
```

### 6.3 MarketDataEngine

```javascript
import { MarketDataEngine } from './src/marketdata/MarketDataEngine.js';

const marketData = new MarketDataEngine(exchange, config);

// 订阅
marketData.subscribe('BTC/USDT', ['ticker', 'depth', 'trade', 'kline']);
marketData.unsubscribe('BTC/USDT');

// 控制
marketData.start();
marketData.stop();

// 事件
marketData.on('ticker', (data) => {});
marketData.on('depth', (data) => {});
marketData.on('trade', (data) => {});
marketData.on('candle', (data) => {});
marketData.on('fundingRate', (data) => {});
marketData.on('error', (error) => {});
```

### 6.4 RiskManager

```javascript
import { RiskManager } from './src/risk/RiskManager.js';

const riskManager = new RiskManager(config);

// 检查订单
const check = riskManager.checkOrder({
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 50000,
});
// { allowed: boolean, reason: string }

// 记录交易
riskManager.recordTrade({
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 50000,
  pnl: 100,
});

// 获取状态
riskManager.getState();
// { dailyPnL, openPositions, totalRisk, ... }
```

### 6.5 OrderExecutor

```javascript
import { OrderExecutor } from './src/executor/orderExecutor.js';

const executor = new OrderExecutor(config);

// 执行订单
const result = await executor.executeOrder({
  exchangeId: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 50000,
  type: 'limit',
});

// 限价单
await executor.executeLimitOrder({ symbol, side, amount, price });

// 市价单
await executor.executeMarketOrder({ symbol, side, amount });

// 撤单
await executor.cancelOrder({ exchangeId, symbol, orderId });
```

### 6.6 BacktestEngine

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

// 加载数据
backtest.loadData('BTC/USDT', candleData);

// 运行回测
const results = await backtest.run();

// 结果结构
{
  initialCapital: 10000,
  finalCapital: 12500,
  totalReturn: 2500,
  returnRate: 0.25,
  totalTrades: 100,
  winningTrades: 55,
  losingTrades: 45,
  winRate: 0.55,
  maxDrawdown: 0.15,
  sharpeRatio: 1.5,
  profitFactor: 1.8,
  avgWin: 150,
  avgLoss: 80,
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

# 启动影子模式策略
npm run pm2:shadow

# 启动实盘策略
npm run pm2:live

# 查看状态
npm run pm2:status

# 查看日志
npm run pm2:logs

# 停止
npm run pm2:stop

# 重启
npm run pm2:restart
```

### 7.2 ecosystem.config.cjs 配置

```javascript
module.exports = {
  apps: [
    // 影子模式 - SMA 策略
    {
      name: 'quant-shadow-sma',
      script: 'src/main.js',
      args: 'shadow --strategy sma --symbols BTC/USDT,ETH/USDT',
      env: {
        NODE_ENV: 'development',
      },
    },

    // 实盘模式 - Grid 策略
    {
      name: 'quant-live-grid',
      script: 'src/main.js',
      args: 'live --strategy grid --symbols BTC/USDT',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

### 7.3 监控配置

#### Prometheus 指标

系统自动在 `:9090/metrics` 端口导出以下指标：

```
# 交易指标
trading_orders_total
trading_orders_filled
trading_pnl
trading_position_count
trading_daily_loss

# 系统指标
system_memory_usage
system_cpu_usage
system_uptime
```

#### Grafana 仪表盘

1. 添加 Prometheus 数据源
2. 导入仪表盘配置
3. 监控内容：
   - 实时 PnL 曲线
   - 交易统计
   - 风险指标
   - 系统健康状态

### 7.4 日志管理

```bash
# 日志目录结构
logs/
├── trading.log         # 交易日志
├── strategy.log        # 策略日志
├── risk.log            # 风控日志
├── error.log           # 错误日志
└── combined.log        # 综合日志
```

日志配置：

```javascript
logging: {
  level: 'info',        // error, warn, info, debug
  dir: 'logs',
  console: true,
  file: true,
  maxSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,
}
```

### 7.5 备份策略

```bash
# 备份数据库
cp data/trading.db data/backup/trading_$(date +%Y%m%d).db

# 备份配置
cp .env .env.backup
cp .keys.enc .keys.enc.backup

# 备份日志
tar -czf logs_$(date +%Y%m%d).tar.gz logs/
```

### 7.6 安全建议

1. **API 密钥加密**：使用 `npm run keys:encrypt` 加密存储
2. **环境隔离**：测试网和主网使用不同账户
3. **权限最小化**：API 密钥只开启必要权限
4. **定期轮换**：定期更换 API 密钥
5. **监控告警**：配置异常告警及时响应

---

## 8. 常见问题

### 8.1 安装问题

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

### 8.2 连接问题

**Q: 交易所连接超时？**

- 检查网络是否需要代理
- 确认 API 密钥正确
- 检查交易所是否在维护

**Q: WebSocket 频繁断开？**

- 增加 `pingInterval` 和 `pongTimeout`
- 检查服务器网络稳定性

### 8.3 交易问题

**Q: 订单一直未成交？**

- 检查价格是否合理
- 确认账户余额充足
- 查看交易所订单状态

**Q: 风控拒绝订单？**

- 检查是否超过日亏损限制
- 确认持仓数量未超限
- 查看具体拒绝原因

### 8.4 策略问题

**Q: 策略不产生信号？**

- 确认历史数据足够
- 检查策略参数是否合理
- 增加日志调试

**Q: 回测结果和实盘差异大？**

- 考虑滑点和手续费
- 实盘流动性可能不足
- 策略可能存在过拟合

### 8.5 性能问题

**Q: 内存占用过高？**

- 减少历史数据缓存
- 清理过期订阅
- 检查内存泄漏

**Q: CPU 使用率高？**

- 减少策略计算频率
- 优化指标计算
- 使用更高效的数据结构

---

## 附录 A: 命令速查

```bash
# 运行模式
npm run backtest           # 回测
npm run shadow             # 影子模式
npm run live               # 实盘
npm run dev                # 开发模式

# 密钥管理
npm run keys:encrypt       # 加密密钥
npm run keys:decrypt       # 解密密钥
npm run keys:verify        # 验证密钥
npm run keys:rotate        # 轮换密钥

# PM2 管理
npm run pm2:start          # 启动
npm run pm2:stop           # 停止
npm run pm2:restart        # 重启
npm run pm2:logs           # 日志
npm run pm2:status         # 状态

# 测试
npm test                   # 运行测试
npm run test:unit          # 单元测试
npm run test:integration   # 集成测试
npm run bench              # 性能测试

# 代码质量
npm run lint               # 检查代码
npm run lint:fix           # 修复代码
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
| DASHBOARD_PORT | 仪表盘端口 | 3000 |

## 附录 C: 内置策略参数

### SMA 策略
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
| gridSpacing | 网格间距 | 0.01 |

---

*文档版本: 1.0.0*
*最后更新: 2025-12*
