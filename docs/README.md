# 量化交易系统 (Quant Trading System)

一个功能完整的 JavaScript/Node.js 量化交易系统，支持多交易所实时行情、智能订单执行、风险管理、策略回测等功能。

---

## 目录

- [项目概览](#项目概览)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [运行模式](#运行模式)
- [核心模块](#核心模块)
- [策略开发](#策略开发)
- [部署指南](#部署指南)
- [API 参考](#api-参考)
- [常见问题](#常见问题)

---

## 项目概览

### 主要特性

- **多交易所支持**: 同时连接 Binance、Bybit、OKX 三大交易所
- **实时行情引擎**: WebSocket 订阅 ticker、depth、trade、fundingRate 数据
- **智能订单执行**: 支持 post-only、reduce-only，500ms 未成交自动撤单重下
- **风险管理**: 仓位限制、止损止盈、敞口控制
- **回测引擎**: 支持历史数据回测，包含滑点和手续费模拟
- **三种运行模式**: 实盘交易 (live)、影子模式 (shadow)、回测 (backtest)
- **PM2 部署**: 生产级进程管理，支持零停机重载

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 18+ (ES Modules) |
| 交易所 API | CCXT |
| 实时数据 | WebSocket (ws) |
| 数据存储 | Redis (ioredis) |
| 进程管理 | PM2 |
| 配置管理 | dotenv + config |
| 日志 | Winston |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         主程序 (main.js)                         │
│                    命令行解析 + 模式选择                          │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│   Live Mode   │       │  Shadow Mode  │       │ Backtest Mode │
│   实盘交易     │       │   影子模式     │       │    回测模式    │
└───────────────┘       └───────────────┘       └───────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       核心模块层                                  │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ MarketData  │  Strategy   │    Risk     │  Executor   │ Backtest│
│   行情引擎   │   策略引擎   │   风控模块   │  订单执行器  │ 回测引擎 │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                       基础设施层                                  │
├─────────────────────────┬───────────────────────────────────────┤
│    Exchange Adapters    │              Redis                    │
│  (Binance/Bybit/OKX)   │     (数据缓存/Stream/Pub-Sub)          │
└─────────────────────────┴───────────────────────────────────────┘
```

### 目录结构

```
quant-trading-system-js/
├── src/
│   ├── main.js              # 主入口，命令行解析
│   ├── index.js             # 模块导出
│   ├── exchange/            # 交易所适配器
│   │   ├── BaseExchange.js  # 基础交易所类
│   │   ├── BinanceAdapter.js
│   │   ├── BybitAdapter.js
│   │   └── OKXAdapter.js
│   ├── marketdata/          # 行情数据模块
│   │   └── MarketDataEngine.js
│   ├── strategies/          # 交易策略
│   │   ├── BaseStrategy.js  # 策略基类
│   │   ├── index.js         # 策略注册
│   │   └── FundingArbStrategy.js
│   ├── risk/                # 风险管理
│   │   └── RiskManager.js
│   ├── executor/            # 订单执行
│   │   └── orderExecutor.js
│   └── backtest/            # 回测引擎
│       └── BacktestEngine.js
├── config/
│   └── default.js           # 默认配置
├── logs/                    # 日志目录
├── data/                    # 数据目录
├── .env.example             # 环境变量模板
├── ecosystem.config.cjs     # PM2 配置
└── package.json
```

---

## 快速开始

### 1. 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd quant-trading-system-js

# 安装依赖
npm install
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件，填入 API 密钥
```

### 3. 启动 Redis

```bash
# Docker 方式
docker run -d --name redis -p 6379:6379 redis:alpine

# 或本地安装后启动
redis-server
```

### 4. 运行系统

```bash
# 影子模式 (推荐首次使用)
npm run shadow

# 实盘模式
npm run live

# 回测模式
npm run backtest
```

---

## 环境配置

### .env 文件配置

```bash
# ============================================
# 运行环境 / Runtime Environment
# ============================================
NODE_ENV=production

# ============================================
# 交易所 API 配置 / Exchange API Configuration
# ============================================

# Binance
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret
BINANCE_SANDBOX=false

# Bybit
BYBIT_API_KEY=your_bybit_api_key
BYBIT_SECRET=your_bybit_secret
BYBIT_SANDBOX=false

# OKX
OKX_API_KEY=your_okx_api_key
OKX_SECRET=your_okx_secret
OKX_PASSPHRASE=your_okx_passphrase
OKX_SANDBOX=false

# ============================================
# Redis 配置 / Redis Configuration
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ============================================
# 日志配置 / Logging Configuration
# ============================================
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# ============================================
# 策略配置 / Strategy Configuration
# ============================================
DEFAULT_STRATEGY=FundingArb
TRADING_SYMBOLS=BTC/USDT:USDT,ETH/USDT:USDT

# ============================================
# 风控配置 / Risk Configuration
# ============================================
MAX_POSITION_SIZE=10000
MAX_DRAWDOWN=0.1
STOP_LOSS_PERCENT=0.02
```

### config/default.js 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `exchanges` | 启用的交易所列表 | `['binance', 'bybit', 'okx']` |
| `tradingType` | 交易类型 (spot/futures) | `futures` |
| `redis.host` | Redis 主机 | `localhost` |
| `redis.port` | Redis 端口 | `6379` |
| `strategy.default` | 默认策略 | `FundingArb` |
| `risk.maxPositionSize` | 最大仓位 | `10000` |
| `risk.maxDrawdown` | 最大回撤 | `0.1` |

---

## 运行模式

### 1. 实盘模式 (Live)

真实下单交易，使用真实资金。

```bash
# 使用 npm 脚本
npm run live

# 或直接运行
node src/main.js live --strategy FundingArb --symbols BTC/USDT:USDT

# 使用 PM2
pm2 start ecosystem.config.cjs --only quant-live
```

**命令行参数:**

| 参数 | 说明 | 示例 |
|------|------|------|
| `--strategy` | 策略名称 | `FundingArb` |
| `--symbols` | 交易对 | `BTC/USDT:USDT,ETH/USDT:USDT` |
| `--exchanges` | 交易所 | `binance,bybit` |
| `--verbose` | 详细日志 | - |

### 2. 影子模式 (Shadow)

模拟交易，使用真实行情但不实际下单，用于策略验证。

```bash
# 使用 npm 脚本
npm run shadow

# 或直接运行
node src/main.js shadow --strategy FundingArb --symbols BTC/USDT:USDT --verbose

# 使用 PM2
pm2 start ecosystem.config.cjs --only quant-shadow
```

### 3. 回测模式 (Backtest)

使用历史数据进行策略回测。

```bash
# 使用 npm 脚本
npm run backtest

# 或直接运行
node src/main.js backtest \
  --strategy FundingArb \
  --start 2024-01-01 \
  --end 2024-06-01 \
  --initial-capital 10000

# 使用 PM2
pm2 start ecosystem.config.cjs --only quant-backtest
```

**回测参数:**

| 参数 | 说明 | 示例 |
|------|------|------|
| `--start` | 开始日期 | `2024-01-01` |
| `--end` | 结束日期 | `2024-06-01` |
| `--initial-capital` | 初始资金 | `10000` |
| `--slippage` | 滑点 | `0.001` |
| `--commission` | 手续费率 | `0.0004` |

---

## 核心模块

### 1. 行情数据引擎 (MarketDataEngine)

实时获取多交易所行情数据。

```javascript
import { MarketDataEngine, DATA_TYPES } from './marketdata/MarketDataEngine.js';

// 创建引擎实例
const engine = new MarketDataEngine({
  exchanges: ['binance', 'bybit', 'okx'],
  tradingType: 'futures',
  redis: {
    host: 'localhost',
    port: 6379,
  },
});

// 启动引擎
await engine.start();

// 订阅行情数据
await engine.subscribe('BTC/USDT', [
  DATA_TYPES.TICKER,      // 行情快照
  DATA_TYPES.DEPTH,       // 深度数据
  DATA_TYPES.TRADE,       // 成交数据
  DATA_TYPES.FUNDING_RATE // 资金费率
]);

// 监听数据事件
engine.on('ticker', (ticker) => {
  console.log(`${ticker.exchange} ${ticker.symbol}: ${ticker.last}`);
});

engine.on('depth', (depth) => {
  console.log(`最佳买价: ${depth.bids[0][0]}, 最佳卖价: ${depth.asks[0][0]}`);
});

engine.on('trade', (trade) => {
  console.log(`成交: ${trade.price} x ${trade.amount} (${trade.side})`);
});

// 获取缓存数据
const ticker = engine.getTicker('BTC/USDT', 'binance');
const depth = engine.getDepth('BTC/USDT', 'binance');

// 停止引擎
await engine.stop();
```

**数据格式:**

```javascript
// Ticker 行情数据
{
  exchange: 'binance',
  symbol: 'BTC/USDT',
  last: 65000.50,           // 最新价
  bid: 65000.00,            // 最佳买价
  bidSize: 1.5,             // 最佳买量
  ask: 65001.00,            // 最佳卖价
  askSize: 2.0,             // 最佳卖量
  open: 64000.00,           // 开盘价
  high: 66000.00,           // 最高价
  low: 63500.00,            // 最低价
  volume: 10000,            // 成交量
  quoteVolume: 650000000,   // 成交额
  change: 1000.50,          // 涨跌额
  changePercent: 1.56,      // 涨跌幅 %
  exchangeTimestamp: 1699999999999,
  localTimestamp: 1699999999999,
  unifiedTimestamp: 1699999999999  // 统一时间戳
}
```

### 2. 智能订单执行器 (SmartOrderExecutor)

处理订单执行，包含限频处理、自动撤单重下等功能。

```javascript
import { SmartOrderExecutor, SIDE, ORDER_TYPE } from './executor/orderExecutor.js';

// 创建执行器
const executor = new SmartOrderExecutor({
  unfillTimeout: 500,           // 500ms 未成交自动撤单
  maxResubmitAttempts: 5,       // 最大重下次数
  priceSlippage: 0.001,         // 价格滑点
  defaultPostOnly: false,       // 默认 post-only
  autoMakerPrice: true,         // 自动调整为 Maker 价格
});

// 初始化 (传入交易所实例)
await executor.init({
  binance: binanceExchange,
  bybit: bybitExchange,
});

// 执行限价单
const result = await executor.executeSmartLimitOrder({
  exchangeId: 'binance',
  accountId: 'main',
  symbol: 'BTC/USDT',
  side: SIDE.BUY,
  amount: 0.01,
  price: 65000,
  postOnly: true,      // 只做 Maker
  reduceOnly: false,   // 非只减仓
});

// 执行市价单
const marketResult = await executor.executeMarketOrder({
  exchangeId: 'binance',
  symbol: 'BTC/USDT',
  side: SIDE.SELL,
  amount: 0.01,
  reduceOnly: true,
});

// 监听订单事件
executor.on('orderSubmitted', ({ orderInfo }) => {
  console.log(`订单已提交: ${orderInfo.clientOrderId}`);
});

executor.on('orderFilled', ({ orderInfo }) => {
  console.log(`订单已成交: ${orderInfo.filledAmount} @ ${orderInfo.avgPrice}`);
});

executor.on('orderResubmitting', ({ orderInfo, newPrice }) => {
  console.log(`订单重下: 新价格 ${newPrice}`);
});

// 取消订单
await executor.cancelOrder(clientOrderId);

// 取消所有订单
await executor.cancelAllOrders('binance', 'BTC/USDT');

// 获取统计信息
const stats = executor.getStats();
console.log(`总订单: ${stats.totalOrders}, 成交: ${stats.filledOrders}`);
```

**执行器特性:**

| 特性 | 说明 |
|------|------|
| Post-Only | 确保订单只做 Maker，降低手续费 |
| 自动撤单重下 | 500ms 未成交自动撤单并以新价格重下 |
| 429 限频处理 | 指数退避重试，最大等待 30 秒 |
| Nonce 冲突处理 | 自动调整时间戳偏移 |
| 多账户并行 | 每账户独立队列，互不干扰 |

### 3. 风险管理器 (RiskManager)

控制交易风险，包括仓位限制、止损止盈等。

```javascript
import { RiskManager } from './risk/RiskManager.js';

// 创建风险管理器
const riskManager = new RiskManager({
  maxPositionSize: 10000,      // 最大仓位 (USDT)
  maxDrawdown: 0.1,            // 最大回撤 10%
  stopLossPercent: 0.02,       // 止损 2%
  takeProfitPercent: 0.05,     // 止盈 5%
  maxOpenOrders: 10,           // 最大挂单数
  maxDailyLoss: 500,           // 日最大亏损
});

// 检查是否可以开仓
const canOpen = riskManager.canOpenPosition({
  symbol: 'BTC/USDT',
  side: 'buy',
  amount: 0.1,
  price: 65000,
});

if (canOpen.allowed) {
  // 执行开仓
} else {
  console.log(`风控拒绝: ${canOpen.reason}`);
}

// 更新仓位
riskManager.updatePosition('BTC/USDT', {
  size: 0.1,
  entryPrice: 65000,
  side: 'long',
});

// 检查止损止盈
const checkResult = riskManager.checkStopLossTakeProfit('BTC/USDT', currentPrice);
if (checkResult.shouldClose) {
  console.log(`触发 ${checkResult.type}: ${checkResult.reason}`);
}

// 获取风控状态
const status = riskManager.getStatus();
console.log(`当前回撤: ${status.currentDrawdown}`);
```

### 4. 回测引擎 (BacktestEngine)

使用历史数据进行策略回测。

```javascript
import { BacktestEngine } from './backtest/BacktestEngine.js';

// 创建回测引擎
const backtest = new BacktestEngine({
  startDate: '2024-01-01',
  endDate: '2024-06-01',
  initialCapital: 10000,
  slippage: 0.001,           // 0.1% 滑点
  commission: 0.0004,        // 0.04% 手续费
  dataSource: 'local',       // 数据源: local/api
});

// 加载历史数据
await backtest.loadData(['BTC/USDT', 'ETH/USDT']);

// 运行回测
const results = await backtest.run(MyStrategy);

// 输出结果
console.log('回测结果:');
console.log(`总收益: ${results.totalReturn}%`);
console.log(`年化收益: ${results.annualizedReturn}%`);
console.log(`最大回撤: ${results.maxDrawdown}%`);
console.log(`夏普比率: ${results.sharpeRatio}`);
console.log(`胜率: ${results.winRate}%`);
console.log(`盈亏比: ${results.profitFactor}`);

// 导出交易记录
await backtest.exportTrades('./results/trades.csv');

// 生成报告
await backtest.generateReport('./results/report.html');
```

---

## 策略开发

### 创建新策略

1. 继承 `BaseStrategy` 基类:

```javascript
// src/strategies/MyStrategy.js
import { BaseStrategy } from './BaseStrategy.js';

export class MyStrategy extends BaseStrategy {
  /**
   * 策略名称
   */
  static name = 'MyStrategy';

  /**
   * 策略描述
   */
  static description = '我的自定义策略';

  /**
   * 策略参数定义
   */
  static parameters = {
    shortPeriod: { type: 'number', default: 10, description: '短周期' },
    longPeriod: { type: 'number', default: 30, description: '长周期' },
    threshold: { type: 'number', default: 0.01, description: '阈值' },
  };

  /**
   * 构造函数
   */
  constructor(params = {}) {
    super(params);

    // 合并参数
    this.params = { ...MyStrategy.parameters, ...params };

    // 初始化状态
    this.state = {
      position: 0,
      lastSignal: null,
    };
  }

  /**
   * 初始化策略
   * @param {Object} context - 上下文对象
   */
  async init(context) {
    // 获取引用
    this.marketData = context.marketData;
    this.executor = context.executor;
    this.riskManager = context.riskManager;

    // 订阅所需数据
    await this.marketData.subscribe(this.symbol, ['ticker', 'fundingRate']);

    console.log(`策略 ${MyStrategy.name} 初始化完成`);
  }

  /**
   * 处理行情更新
   * @param {Object} ticker - 行情数据
   */
  async onTicker(ticker) {
    // 计算信号
    const signal = this.calculateSignal(ticker);

    // 风控检查
    if (!this.riskManager.canTrade()) {
      return;
    }

    // 执行交易
    if (signal === 'buy' && this.state.position <= 0) {
      await this.openLong(ticker.last);
    } else if (signal === 'sell' && this.state.position >= 0) {
      await this.openShort(ticker.last);
    }
  }

  /**
   * 计算交易信号
   * @param {Object} ticker - 行情数据
   * @returns {string|null} 信号: 'buy', 'sell', null
   */
  calculateSignal(ticker) {
    // 实现你的信号逻辑
    // ...
    return null;
  }

  /**
   * 开多仓
   */
  async openLong(price) {
    const result = await this.executor.executeSmartLimitOrder({
      exchangeId: this.exchangeId,
      symbol: this.symbol,
      side: 'buy',
      amount: this.calculateSize(price),
      price: price,
      postOnly: true,
    });

    if (result.success) {
      this.state.position = result.orderInfo.filledAmount;
      this.emit('positionOpened', { side: 'long', ...result });
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 取消所有挂单
    await this.executor.cancelAllOrders(this.exchangeId, this.symbol);

    console.log(`策略 ${MyStrategy.name} 已清理`);
  }
}

export default MyStrategy;
```

2. 注册策略:

```javascript
// src/strategies/index.js
import { BaseStrategy } from './BaseStrategy.js';
import { FundingArbStrategy } from './FundingArbStrategy.js';
import { MyStrategy } from './MyStrategy.js';  // 添加你的策略

// 策略注册表
export const strategies = {
  FundingArb: FundingArbStrategy,
  MyStrategy: MyStrategy,  // 注册
};

// 获取策略类
export function getStrategy(name) {
  const Strategy = strategies[name];
  if (!Strategy) {
    throw new Error(`策略不存在: ${name}`);
  }
  return Strategy;
}
```

3. 运行新策略:

```bash
node src/main.js shadow --strategy MyStrategy --symbols BTC/USDT:USDT
```

### 策略生命周期

```
┌─────────────┐
│ constructor │  初始化参数和状态
└──────┬──────┘
       ▼
┌─────────────┐
│    init     │  获取上下文，订阅数据
└──────┬──────┘
       ▼
┌─────────────┐
│  onTicker   │◄─── 循环处理行情
│  onDepth    │
│  onTrade    │
└──────┬──────┘
       ▼
┌─────────────┐
│   cleanup   │  取消挂单，清理资源
└─────────────┘
```

### 策略事件

| 事件 | 说明 | 参数 |
|------|------|------|
| `onTicker` | 行情更新 | `ticker` |
| `onDepth` | 深度更新 | `depth` |
| `onTrade` | 成交更新 | `trade` |
| `onFundingRate` | 资金费率更新 | `fundingRate` |
| `onOrderFilled` | 订单成交 | `order` |
| `onPositionChange` | 仓位变化 | `position` |

---

## 部署指南

### PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动所有应用
pm2 start ecosystem.config.cjs

# 仅启动实盘
pm2 start ecosystem.config.cjs --only quant-live

# 仅启动影子模式
pm2 start ecosystem.config.cjs --only quant-shadow

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 监控面板
pm2 monit

# 零停机重载
pm2 reload ecosystem.config.cjs

# 停止所有
pm2 stop ecosystem.config.cjs

# 删除所有
pm2 delete ecosystem.config.cjs

# 保存进程列表 (开机自启)
pm2 save
pm2 startup
```

### PM2 配置说明

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'quant-live',
      script: 'src/main.js',
      args: 'live --strategy FundingArb --symbols BTC/USDT:USDT',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },
      // 日志配置
      out_file: './logs/pm2/live-out.log',
      error_file: './logs/pm2/live-error.log',
      merge_logs: true,
      time: true,
      // 重启策略
      min_uptime: '60s',
      max_restarts: 10,
      restart_delay: 5000,
      // 优雅关闭
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
    },
  ],
};
```

### Docker 部署 (可选)

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

CMD ["node", "src/main.js", "live"]
```

```bash
# 构建镜像
docker build -t quant-trading-system .

# 运行容器
docker run -d \
  --name quant-live \
  --restart unless-stopped \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/logs:/app/logs \
  quant-trading-system
```

---

## API 参考

### MarketDataEngine

| 方法 | 说明 |
|------|------|
| `start()` | 启动引擎 |
| `stop()` | 停止引擎 |
| `subscribe(symbol, dataTypes, exchanges)` | 订阅行情 |
| `unsubscribe(symbol, dataTypes, exchanges)` | 取消订阅 |
| `batchSubscribe(symbols, dataTypes)` | 批量订阅 |
| `getTicker(symbol, exchange)` | 获取缓存行情 |
| `getDepth(symbol, exchange)` | 获取缓存深度 |
| `getFundingRate(symbol, exchange)` | 获取资金费率 |
| `getConnectionStatus()` | 获取连接状态 |
| `getStats()` | 获取统计信息 |

### SmartOrderExecutor

| 方法 | 说明 |
|------|------|
| `init(exchanges)` | 初始化执行器 |
| `stop()` | 停止执行器 |
| `executeSmartLimitOrder(params)` | 执行智能限价单 |
| `executeMarketOrder(params)` | 执行市价单 |
| `cancelOrder(clientOrderId)` | 取消订单 |
| `cancelAllOrders(exchangeId, symbol)` | 取消所有订单 |
| `getOrderStatus(clientOrderId)` | 获取订单状态 |
| `getActiveOrders()` | 获取活跃订单 |
| `getStats()` | 获取统计信息 |

### RiskManager

| 方法 | 说明 |
|------|------|
| `canOpenPosition(params)` | 检查是否可开仓 |
| `updatePosition(symbol, position)` | 更新仓位 |
| `checkStopLossTakeProfit(symbol, price)` | 检查止损止盈 |
| `getStatus()` | 获取风控状态 |
| `reset()` | 重置状态 |

---

## 常见问题

### Q: 如何添加新的交易所？

继承 `BaseExchange` 并实现必要方法:

```javascript
import { BaseExchange } from './BaseExchange.js';

export class NewExchange extends BaseExchange {
  constructor(config) {
    super(config);
    // 初始化 CCXT 实例
  }

  async fetchTicker(symbol) {
    // 实现获取行情
  }

  async createOrder(symbol, type, side, amount, price, params) {
    // 实现下单
  }

  // ... 其他方法
}
```

### Q: 如何处理 429 限频错误？

系统内置了指数退避重试机制:

- 初始等待: 1 秒
- 最大等待: 30 秒
- 退避乘数: 2
- 最大重试: 5 次

可在配置中调整:

```javascript
{
  rateLimitInitialWait: 1000,
  rateLimitMaxWait: 30000,
  rateLimitBackoffMultiplier: 2,
  rateLimitMaxRetries: 5,
}
```

### Q: 如何确保订单成为 Maker？

使用 `postOnly: true` 参数:

```javascript
await executor.executeSmartLimitOrder({
  // ...
  postOnly: true,
});
```

系统会自动将价格调整到买一/卖一内侧。

### Q: 回测数据从哪里获取？

1. **本地文件**: 将 CSV 数据放入 `data/` 目录
2. **API 获取**: 配置交易所 API 自动下载

```javascript
const backtest = new BacktestEngine({
  dataSource: 'api',  // 或 'local'
  // ...
});
```

### Q: 如何监控系统运行状态？

```bash
# PM2 监控
pm2 monit

# 查看日志
pm2 logs quant-live --lines 100

# 查看统计
pm2 show quant-live
```

---

## 许可证

MIT License

---

## 更新日志

### v1.0.0
- 初始版本
- 支持 Binance/Bybit/OKX 三大交易所
- 实现智能订单执行器
- 实现实时行情引擎
- 实现风险管理模块
- 实现回测引擎
- PM2 部署支持
