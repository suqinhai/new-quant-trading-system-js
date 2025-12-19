<!-- 行情喂策略，策略喂执行，风控卡在最前面，回测只用来练手 -->

<!-- “先活下来，再活得好，最后活得久。”
→ 对应模块就是：
RiskManager + ExchangeAdapter + OrderExecutor > MarketData > Strategy >>> Backtest
把前三板斧练到极致，你已经秒杀了市面上90%的量化团队。 -->

# 量化交易系统 (Quant Trading System)

一个功能完整的 JavaScript/Node.js 量化交易系统，支持多交易所实时行情、智能订单执行、风险管理、策略回测等功能。

---

## 目录

- [项目概览](#项目概览)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
  - [API 密钥加密存储](#api-密钥加密存储-推荐)
- [运行模式](#运行模式)
- [核心模块](#核心模块)
- [策略开发](#策略开发)
- [ClickHouse 数据库](#clickhouse-数据库)
- [CI/CD 自动化测试](#cicd-自动化测试)
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

### API 密钥加密存储 (推荐)

为了保护敏感的 API 密钥，系统提供了加密存储功能，使用 **AES-256-GCM** 加密算法。

#### 快速设置

```bash
# 1. 生成安全的主密码
pnpm keys:generate

# 2. 加密 API 密钥 (可从 .env 自动读取或手动输入)
pnpm keys:encrypt

# 3. 设置主密码环境变量
export MASTER_KEY="你生成的主密码"    # Linux/Mac
$env:MASTER_KEY="你生成的主密码"      # Windows PowerShell

# 4. 启动系统 (自动解密)
pnpm start
```

#### 密钥管理命令

| 命令 | 说明 |
|------|------|
| `pnpm keys:encrypt` | 加密 API 密钥并保存到 `.keys.enc` |
| `pnpm keys:decrypt` | 解密并显示存储的密钥 |
| `pnpm keys:verify` | 验证加密文件完整性 |
| `pnpm keys:generate` | 生成安全的随机主密码 |
| `pnpm keys:rotate` | 轮换主密码 |

#### 两种加密方式

**方式一：加密文件存储 (推荐)**

密钥加密后存储在 `.keys.enc` 文件中，启动时自动解密：

```bash
pnpm keys:encrypt  # 交互式加密
```

**方式二：环境变量内加密**

在 `.env` 中使用 `ENC(...)` 格式存储加密值：

```bash
BINANCE_API_KEY=ENC(base64加密后的值)
BINANCE_SECRET=ENC(base64加密后的值)
```

#### 加载优先级

```
加密文件 (.keys.enc) > 加密环境变量 ENC(...) > 明文环境变量
```

#### 安全特性

- **AES-256-GCM** 认证加密算法
- **PBKDF2** 密钥派生 (100,000 次迭代)
- 密码强度验证 (最少12位，包含大小写、数字、特殊字符)
- 加密文件权限设置为 600 (仅所有者可读写)
- 支持主密码定期轮换

#### 注意事项

- 主密码丢失后无法恢复加密的密钥，请妥善保管
- `.keys.enc` 文件已添加到 `.gitignore`，不会被提交
- 生产环境建议通过环境变量传入 `MASTER_KEY`，而非写入文件

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

## CI/CD 自动化测试

### 概述

项目已配置 GitHub Actions 实现自动化测试和代码质量检查，每次推送和 PR 都会触发以下流程：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Lint     │────▶│    Test     │────▶│    Build    │
│  代码检查    │     │   单元测试   │     │   构建验证   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
   ESLint 检查        Node 20/22          语法检查
   代码规范           测试覆盖率           CLI 验证
```

### 本地测试命令

```bash
# 运行所有测试
pnpm test

# 仅运行单元测试
pnpm test:unit

# 仅运行集成测试
pnpm test:integration

# 监视模式 (文件变化自动重跑)
pnpm test:watch

# 测试覆盖率
pnpm test:coverage

# 代码检查
pnpm lint

# 自动修复代码风格
pnpm lint:fix

# CI 完整流程 (lint + test)
pnpm ci
```

### 测试目录结构

```
tests/
├── unit/                    # 单元测试
│   ├── crypto.test.js      # 加密模块测试
│   ├── helpers.test.js     # 辅助函数测试
│   └── validators.test.js  # 验证器测试
└── integration/            # 集成测试
    └── config.test.js      # 配置加载测试
```

### GitHub Actions 工作流

| 工作流 | 文件 | 触发条件 | 功能 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | push/PR | 完整测试流程 |
| PR Check | `.github/workflows/pr.yml` | PR | 快速检查 + 自动标签 |

### CI 流程详解

1. **Lint (代码检查)**
   - ESLint 静态分析
   - 代码风格检查

2. **Test (测试)**
   - Node.js 20/22 双版本测试
   - 单元测试 + 集成测试

3. **Security (安全审计)**
   - 依赖漏洞扫描
   - `pnpm audit`

4. **Build (构建验证)**
   - 模块导入验证
   - CLI 可执行性检查

### 编写测试

使用 Node.js 内置测试框架：

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('MyModule', () => {
  it('should work correctly', () => {
    const result = myFunction();
    assert.strictEqual(result, expected);
  });
});
```

### PR 合并要求

- [ ] 所有测试通过
- [ ] ESLint 检查通过
- [ ] 无高危依赖漏洞

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

1. **ClickHouse 数据库**: 使用历史数据下载脚本存储到 ClickHouse (推荐)
2. **本地文件**: 将 CSV 数据放入 `data/` 目录
3. **API 获取**: 配置交易所 API 自动下载

```javascript
const backtest = new BacktestEngine({
  dataSource: 'api',  // 或 'local'
  // ...
});
```

---

## ClickHouse 数据库

项目使用 **ClickHouse** 作为历史数据存储引擎，提供高性能的时序数据查询能力。

### 安装 ClickHouse

```bash
# Docker 方式 (推荐)
docker run -d \
  --name clickhouse \
  -p 8123:8123 \
  -p 9000:9000 \
  -v clickhouse-data:/var/lib/clickhouse \
  clickhouse/clickhouse-server

# 验证安装
curl http://localhost:8123/ping
```

### 数据表结构

系统自动创建以下表结构 (每个交易所一套):

| 表名 | 用途 | 字段说明 |
|------|------|----------|
| `ohlcv_{exchange}` | K线数据 | symbol, timestamp, open, high, low, close, volume |
| `funding_rate_{exchange}` | 资金费率 | symbol, timestamp, funding_rate, mark_price, index_price |
| `open_interest_{exchange}` | 持仓量 | symbol, timestamp, open_interest, open_interest_value |
| `mark_price_{exchange}` | 标记价格 | symbol, timestamp, mark_price, index_price |

**表引擎**: `ReplacingMergeTree` (自动去重)
**分区方式**: 按月分区 (`toYYYYMM(timestamp)`)
**排序键**: `(symbol, timestamp)`

### 历史数据下载

使用 `scripts/download-history.js` 下载历史数据:

```bash
# 基本用法
node scripts/download-history.js [options]

# 选项说明
-e, --exchange <name>    交易所 (binance, bybit, okx, all)
-s, --symbol <symbol>    交易对 (BTC/USDT:USDT)
-t, --type <type>        数据类型 (ohlcv, funding_rate, open_interest, mark_price, all)
--start <date>           起始日期 (YYYY-MM-DD)
--end <date>             结束日期 (YYYY-MM-DD)
--ch-host <url>          ClickHouse 主机 (默认: http://localhost:8123)
--ch-database <name>     数据库名 (默认: quant)
```

**使用示例:**

```bash
# 下载所有交易所的 BTC/ETH 全部数据类型
node scripts/download-history.js -s BTC/USDT:USDT,ETH/USDT:USDT

# 只下载 Binance 的 K线数据
node scripts/download-history.js -e binance -t ohlcv -s BTC/USDT:USDT

# 指定时间范围下载
node scripts/download-history.js --start 2023-01-01 --end 2023-12-31 -s BTC/USDT:USDT

# 下载资金费率数据 (用于套利策略)
node scripts/download-history.js -t funding_rate -s BTC/USDT:USDT,ETH/USDT:USDT

# 连接远程 ClickHouse
node scripts/download-history.js --ch-host http://192.168.1.100:8123 --ch-database trading
```

### ClickHouse 配置

默认配置 (可在脚本中修改):

```javascript
const DEFAULT_CONFIG = {
  clickhouse: {
    host: 'http://localhost:8123',  // ClickHouse HTTP 接口
    database: 'quant',               // 数据库名
    username: 'default',             // 用户名
    password: '',                    // 密码
  },
  download: {
    startDate: '2020-01-01',         // 默认起始日期
    endDate: null,                   // null = 今天
    batchSize: 1000,                 // 批量插入大小
    rateLimit: 100,                  // 请求间隔 (ms)
    maxRetries: 3,                   // 最大重试次数
  },
};
```

### 数据查询示例

```sql
-- 查询 BTC 最近 24 小时 K线
SELECT *
FROM quant.ohlcv_binance
WHERE symbol = 'BTC/USDT:USDT'
  AND timestamp >= now() - INTERVAL 24 HOUR
ORDER BY timestamp DESC
LIMIT 100;

-- 查询资金费率历史
SELECT
  timestamp,
  funding_rate,
  funding_rate * 3 * 365 as annualized_rate
FROM quant.funding_rate_binance
WHERE symbol = 'BTC/USDT:USDT'
ORDER BY timestamp DESC
LIMIT 50;

-- 对比不同交易所的资金费率
SELECT
  b.timestamp,
  b.funding_rate as binance_rate,
  y.funding_rate as bybit_rate,
  o.funding_rate as okx_rate,
  (b.funding_rate - y.funding_rate) * 3 * 365 as spread_annualized
FROM quant.funding_rate_binance b
JOIN quant.funding_rate_bybit y ON b.timestamp = y.timestamp AND b.symbol = y.symbol
JOIN quant.funding_rate_okx o ON b.timestamp = o.timestamp AND b.symbol = o.symbol
WHERE b.symbol = 'BTC/USDT:USDT'
ORDER BY b.timestamp DESC
LIMIT 20;

-- 查询持仓量变化
SELECT
  timestamp,
  open_interest,
  open_interest - lagInFrame(open_interest) OVER (ORDER BY timestamp) as oi_change
FROM quant.open_interest_binance
WHERE symbol = 'BTC/USDT:USDT'
ORDER BY timestamp DESC
LIMIT 100;
```

### 数据下载特性

| 特性 | 说明 |
|------|------|
| **增量更新** | 自动检测已有数据，只下载新数据 |
| **断点续传** | 中断后可继续下载 |
| **多交易所** | 支持 Binance、Bybit、OKX |
| **速率限制** | 自动处理 API 限频 |
| **批量插入** | 高效批量写入 ClickHouse |
| **自动建表** | 首次运行自动创建数据库和表 |

### 定时同步

使用 cron 定时同步最新数据:

```bash
# 编辑 crontab
crontab -e

# 每小时同步一次 K线数据
0 * * * * cd /path/to/project && node scripts/download-history.js -t ohlcv -s BTC/USDT:USDT,ETH/USDT:USDT >> /var/log/quant-sync.log 2>&1

# 每 8 小时同步资金费率 (资金费率每 8 小时结算一次)
0 */8 * * * cd /path/to/project && node scripts/download-history.js -t funding_rate -s BTC/USDT:USDT,ETH/USDT:USDT >> /var/log/quant-sync.log 2>&1
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

---

## 附录

### A. 内置策略详解

#### 1. SMA 双均线策略 (SMAStrategy)

**原理**: 利用快慢两条移动平均线的交叉产生交易信号。

```javascript
import { SMAStrategy } from './src/strategies/index.js';

const strategy = new SMAStrategy({
  fastPeriod: 10,   // 快线周期
  slowPeriod: 20,   // 慢线周期
  symbols: ['BTC/USDT'],
  timeframe: '1h',
});
```

**信号逻辑**:
- 金叉 (快线上穿慢线): 买入信号
- 死叉 (快线下穿慢线): 卖出信号

#### 2. RSI 策略 (RSIStrategy)

**原理**: 利用相对强弱指标判断超买超卖。

```javascript
import { RSIStrategy } from './src/strategies/index.js';

const strategy = new RSIStrategy({
  period: 14,        // RSI 周期
  overbought: 70,    // 超买阈值
  oversold: 30,      // 超卖阈值
  symbols: ['BTC/USDT'],
});
```

**信号逻辑**:
- RSI < 30: 超卖，买入信号
- RSI > 70: 超买，卖出信号

#### 3. MACD 策略 (MACDStrategy)

**原理**: 利用 MACD 指标的金叉死叉和柱状图变化。

```javascript
import { MACDStrategy } from './src/strategies/index.js';

const strategy = new MACDStrategy({
  fastPeriod: 12,    // 快线周期
  slowPeriod: 26,    // 慢线周期
  signalPeriod: 9,   // 信号线周期
  symbols: ['BTC/USDT'],
});
```

#### 4. 布林带策略 (BollingerBandsStrategy)

**原理**: 利用价格突破布林带产生交易信号。

```javascript
import { BollingerBandsStrategy } from './src/strategies/index.js';

const strategy = new BollingerBandsStrategy({
  period: 20,        // 周期
  stdDev: 2,         // 标准差倍数
  symbols: ['BTC/USDT'],
});
```

**信号逻辑**:
- 价格触及下轨: 买入信号
- 价格触及上轨: 卖出信号

#### 5. 网格策略 (GridStrategy)

**原理**: 在价格区间内设置多个买卖点，低买高卖赚取差价。

```javascript
import { GridStrategy } from './src/strategies/index.js';

const strategy = new GridStrategy({
  gridCount: 10,       // 网格数量
  gridSpacing: 0.01,   // 网格间距 (1%)
  upperPrice: 70000,   // 上限价格
  lowerPrice: 50000,   // 下限价格
  symbols: ['BTC/USDT'],
});
```

#### 6. 资金费率套利策略 (FundingArbStrategy)

**原理**: 利用不同交易所之间的资金费率差异进行对冲套利。

```javascript
import { FundingArbStrategy } from './src/strategies/index.js';

const strategy = new FundingArbStrategy({
  symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT'],
  minAnnualizedSpread: 0.15,   // 最小年化利差 15%
  closeSpreadThreshold: 0.05,  // 平仓阈值 5%
  maxPositionSize: 10000,      // 最大仓位
  leverage: 5,                 // 杠杆倍数
});
```

**策略流程**:
1. 监控多交易所资金费率
2. 计算年化利差
3. 当利差 > 15%: 做空高费率交易所，做多低费率交易所
4. 当利差 < 5%: 平仓获利

### B. 技术指标完整列表

| 指标 | 函数 | 参数 | 用途 |
|------|------|------|------|
| **移动平均** |
| SMA | `SMA(data, period)` | 数据, 周期 | 简单移动平均 |
| EMA | `EMA(data, period)` | 数据, 周期 | 指数移动平均 |
| WMA | `WMA(data, period)` | 数据, 周期 | 加权移动平均 |
| VWMA | `VWMA(closes, volumes, period)` | 收盘价, 成交量, 周期 | 成交量加权移动平均 |
| **震荡指标** |
| RSI | `RSI(data, period)` | 数据, 周期 | 相对强弱指数 |
| Stochastic | `Stochastic(h, l, c, k, d, dma)` | 高, 低, 收, K周期, D周期, D平滑 | 随机指标 |
| WilliamsR | `WilliamsR(h, l, c, period)` | 高, 低, 收, 周期 | 威廉指标 |
| CCI | `CCI(h, l, c, period)` | 高, 低, 收, 周期 | 商品通道指数 |
| **趋势指标** |
| MACD | `MACD(data, fast, slow, signal)` | 数据, 快周期, 慢周期, 信号周期 | 移动平均收敛/发散 |
| ADX | `ADX(h, l, c, period)` | 高, 低, 收, 周期 | 平均趋向指数 |
| PSAR | `PSAR(h, l, step, max)` | 高, 低, 步进, 最大值 | 抛物线转向 |
| **波动率指标** |
| BollingerBands | `BollingerBands(data, period, stdDev)` | 数据, 周期, 标准差倍数 | 布林带 |
| ATR | `ATR(h, l, c, period)` | 高, 低, 收, 周期 | 真实波幅 |
| KeltnerChannels | `KeltnerChannels(h, l, c, period, mult)` | 高, 低, 收, 周期, 倍数 | 肯特纳通道 |
| **成交量指标** |
| OBV | `OBV(closes, volumes)` | 收盘价, 成交量 | 能量潮 |
| MFI | `MFI(h, l, c, v, period)` | 高, 低, 收, 量, 周期 | 资金流量指数 |
| VROC | `VROC(volumes, period)` | 成交量, 周期 | 成交量变化率 |
| **动量指标** |
| Momentum | `Momentum(data, period)` | 数据, 周期 | 动量 |
| ROC | `ROC(data, period)` | 数据, 周期 | 变化率 |
| **支撑阻力** |
| PivotPoints | `PivotPoints(h, l, c)` | 高, 低, 收 | 枢轴点 |
| FibonacciRetracement | `FibonacciRetracement(high, low)` | 高点, 低点 | 斐波那契回撤 |

### C. 配置项完整参考

```javascript
// config/default.js 完整配置项
export default {
  // 交易所配置
  exchange: {
    default: 'binance',
    binance: {
      enabled: true,
      sandbox: false,
      timeout: 30000,
      enableRateLimit: true,
      defaultType: 'spot',  // spot | future | swap
    },
    okx: { /* ... */ },
  },

  // 行情配置
  marketData: {
    websocket: {
      pingInterval: 30000,
      pongTimeout: 10000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
    },
    aggregator: {
      aggregateInterval: 1000,
      arbitrageThreshold: 0.5,
    },
    cache: {
      maxCandles: 1000,
      tickerExpiry: 5000,
    },
  },

  // 策略配置
  strategy: {
    default: 'sma',
    defaults: {
      timeframe: '1h',
      capitalRatio: 0.1,
      stopLoss: 0.02,
      takeProfit: 0.04,
    },
    sma: { fastPeriod: 10, slowPeriod: 20 },
    rsi: { period: 14, overbought: 70, oversold: 30 },
    bollingerBands: { period: 20, stdDev: 2 },
    macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    grid: { gridCount: 10, gridSpacing: 0.01 },
  },

  // 风控配置
  risk: {
    enabled: true,
    maxPositionRatio: 0.3,
    maxRiskPerTrade: 0.02,
    maxDailyLoss: 1000,
    maxDrawdown: 0.2,
    maxPositions: 5,
    maxLeverage: 3,
    positionSizing: 'risk_based',  // fixed | risk_based | kelly | atr_based
    stopLoss: {
      enabled: true,
      defaultRatio: 0.02,
      trailingStop: true,
      trailingRatio: 0.015,
    },
    takeProfit: {
      enabled: true,
      defaultRatio: 0.04,
      partialTakeProfit: false,
      partialRatios: [0.5, 0.3, 0.2],
    },
    blacklist: [],
    whitelist: [],
  },

  // 执行器配置
  executor: {
    maxRetries: 3,
    retryDelay: 1000,
    maxSlippage: 0.5,
    orderTimeout: 30000,
    enableTWAP: true,
    twap: {
      splitThreshold: 10000,
      splitCount: 5,
      splitInterval: 2000,
    },
    concurrency: 3,
  },

  // 回测配置
  backtest: {
    initialCapital: 10000,
    commission: 0.001,
    slippage: 0.0005,
    dataDir: 'data/historical',
    outputDir: 'data/backtest_results',
  },

  // 监控配置
  monitor: {
    collectInterval: 10000,
    healthCheckInterval: 30000,
    memoryWarningThreshold: 512,
    cpuWarningThreshold: 80,
    prometheus: { enabled: true, port: 9090 },
  },

  // 告警配置
  alert: {
    cooldown: 60000,
    email: { enabled: false },
    telegram: { enabled: false },
    dingtalk: { enabled: false },
    webhook: { enabled: false },
  },

  // 日志配置
  logging: {
    level: 'info',
    dir: 'logs',
    console: true,
    file: true,
    maxSize: 10485760,
    maxFiles: 5,
  },

  // 数据库配置
  database: {
    type: 'sqlite',
    sqlite: { filename: 'data/trading.db' },
    redis: { enabled: false },
  },

  // 服务端口配置
  server: {
    httpPort: 3000,
    wsPort: 3001,
    dashboardPort: 8080,
  },
};
```

### D. 错误代码参考

| 错误代码 | 含义 | 处理方式 |
|---------|------|---------|
| `ERR_INSUFFICIENT_BALANCE` | 余额不足 | 检查账户余额 |
| `ERR_ORDER_REJECTED` | 订单被拒绝 | 检查订单参数 |
| `ERR_RATE_LIMIT` | 请求频率超限 | 自动退避重试 |
| `ERR_NETWORK_TIMEOUT` | 网络超时 | 自动重连 |
| `ERR_INVALID_SYMBOL` | 无效交易对 | 检查交易对格式 |
| `ERR_POSITION_LIMIT` | 仓位超限 | 检查风控配置 |
| `ERR_LEVERAGE_LIMIT` | 杠杆超限 | 降低杠杆倍数 |
| `ERR_DAILY_LOSS_LIMIT` | 日亏损超限 | 等待第二天重置 |

### E. 性能优化建议

1. **数据缓存**: 启用 Redis 缓存行情数据
2. **批量订阅**: 使用 `batchSubscribe` 批量订阅行情
3. **连接池**: 复用交易所 HTTP 连接
4. **日志级别**: 生产环境使用 `info` 级别
5. **内存管理**: 定期清理历史数据缓存

### F. 安全建议

1. **API 密钥**: 仅授予必要权限，禁止提币权限
2. **IP 白名单**: 在交易所设置 IP 白名单
3. **环境变量**: 敏感信息使用环境变量
4. **日志脱敏**: 日志中不记录完整 API 密钥
5. **定期轮换**: 定期更换 API 密钥

---

*文档版本: 1.0.0 | 最后更新: 2025-01*
