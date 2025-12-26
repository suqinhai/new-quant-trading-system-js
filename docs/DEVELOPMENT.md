# 代码开发文档

## 目录

1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [核心模块](#核心模块)
5. [开发环境搭建](#开发环境搭建)
6. [编码规范](#编码规范)
7. [模块详解](#模块详解)
8. [扩展开发](#扩展开发)

---

## 项目概述

本项目是一个企业级量化交易系统，采用 Node.js 开发，支持多交易所、多策略的自动化交易。系统具备完整的回测、影子交易和实盘交易功能，配备专业的风控系统和监控告警能力。

### 核心特性

- **三种运行模式**：回测(backtest)、影子交易(shadow)、实盘交易(live)
- **多交易所支持**：Binance、Bybit、OKX
- **多策略框架**：SMA、RSI、MACD、布林带、网格、资金费率套利、Regime 切换
- **市场状态识别**：自动识别趋势/震荡/高波动市场，动态切换策略
- **专业风控**：多层风控、黑天鹅保护、熔断机制
- **完整监控**：Prometheus 指标、Telegram 告警、审计日志

---

## 技术栈

### 运行时环境
- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0

### 核心框架
| 依赖 | 版本 | 用途 |
|------|------|------|
| express | 4.18.x | Web API 服务器 |
| socket.io | 4.7.x | WebSocket 实时通信 |
| ccxt | 4.2.x | 统一交易所接口 |

### 数据库
| 数据库 | 驱动 | 用途 |
|--------|------|------|
| Redis | ioredis | 实时数据存储、订单/持仓状态 |
| ClickHouse | @clickhouse/client | 历史数据分析、交易归档 |

### 工具库
| 库 | 用途 |
|----|------|
| decimal.js | 高精度数值计算 |
| technicalindicators | 技术指标计算 |
| winston/pino | 日志记录 |
| prom-client | Prometheus 指标 |
| zod | 参数校验 |

---

## 项目结构

```
src/
├── main.js                 # 主入口文件
├── index.js                # 统一引擎入口
├── api/                    # REST API 模块
│   ├── server.js          # Express 服务器
│   ├── routes/            # API 路由
│   ├── rateLimit.js       # 限流配置
│   └── rbac.js            # 权限控制
├── strategies/            # 交易策略
│   ├── BaseStrategy.js    # 策略基类
│   ├── SMAStrategy.js     # SMA 策略
│   ├── RSIStrategy.js     # RSI 策略
│   ├── RegimeSwitchingStrategy.js  # Regime 切换元策略
│   └── ...                # 其他策略
├── exchange/              # 交易所集成
│   ├── BaseExchange.js    # 交易所基类
│   ├── BinanceExchange.js # Binance
│   ├── BybitExchange.js   # Bybit
│   └── OKXExchange.js     # OKX
├── marketdata/            # 行情数据
│   ├── MarketDataEngine.js # 行情引擎
│   └── DataAggregator.js  # 数据聚合
├── backtest/              # 回测系统
│   ├── BacktestEngine.js  # 回测引擎
│   └── runner.js          # 回测运行器
├── risk/                  # 风控系统
│   ├── RiskSystem.js      # 统一风控入口
│   ├── RiskManager.js     # 风险管理器
│   ├── BlackSwanProtector.js # 黑天鹅保护
│   └── CircuitBreaker.js  # 熔断器
├── executor/              # 订单执行
│   ├── orderExecutor.js   # 智能执行器
│   └── ExchangeFailover.js # 故障转移
├── database/              # 数据库层
│   ├── DatabaseManager.js # 本地存储 (预留)
│   ├── redis/             # Redis 模块 (主存储)
│   └── clickhouse/        # ClickHouse 模块 (归档)
├── logger/                # 日志告警
│   ├── PnLLogger.js       # PnL 日志
│   ├── TelegramNotifier.js # Telegram 通知
│   └── MetricsExporter.js # 指标导出
├── monitoring/            # 系统监控
├── utils/                 # 工具函数
│   ├── indicators.js      # 技术指标 (含 Hurst 指数)
│   ├── MarketRegimeDetector.js  # 市场状态检测器
│   └── helpers.js         # 辅助函数
├── config/                # 配置管理
└── middleware/            # Express 中间件
```

---

## 核心模块

### 1. 主入口 (main.js)

```javascript
// TradingSystemRunner 类 - 系统生命周期管理
class TradingSystemRunner {
  constructor(options) {
    this.mode = options.mode;  // 'backtest' | 'shadow' | 'live'
    this.config = options.config;
  }

  async start() {
    // 1. 初始化数据库
    // 2. 初始化行情引擎
    // 3. 初始化风控系统
    // 4. 加载策略
    // 5. 启动 API 服务器
  }

  async stop() {
    // 优雅关闭所有组件
  }
}
```

### 2. 运行模式常量

```javascript
const RUN_MODE = {
  BACKTEST: 'backtest',  // 历史数据回测
  SHADOW: 'shadow',      // 实时行情，模拟下单
  LIVE: 'live'           // 实盘交易
};

const SYSTEM_STATUS = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};
```

### 3. 策略基类接口

```javascript
class BaseStrategy extends EventEmitter {
  // 生命周期方法
  async onInit() {}           // 初始化
  async onTick(candle) {}     // K线更新（回测）
  async onCandle(data) {}     // K线更新（实盘）
  async onTicker(data) {}     // Ticker 更新
  async onOrderBook(data) {}  // 订单簿更新

  // 交易信号
  emit('signal', {
    action: 'buy' | 'sell',
    symbol: 'BTC/USDT',
    amount: 0.1,
    price: 50000
  });
}
```

---

## 开发环境搭建

### 1. 克隆项目

```bash
git clone <repository-url>
cd new-quant-trading-system-js
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# 运行环境
NODE_ENV=development

# API 服务器
HTTP_PORT=3000
METRICS_PORT=9090

# Binance 配置
BINANCE_API_KEY=your_api_key
BINANCE_SECRET=your_secret

# Bybit 配置
BYBIT_API_KEY=your_api_key
BYBIT_SECRET=your_secret

# OKX 配置
OKX_API_KEY=your_api_key
OKX_SECRET=your_secret
OKX_PASSPHRASE=your_passphrase

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# Telegram 配置
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 4. 启动开发服务器

```bash
# 开发模式（带热重载）
npm run dev

# 回测模式
npm run backtest

# 影子交易模式
npm run shadow

# 实盘模式（谨慎使用）
npm run live
```

---

## 编码规范

### JavaScript 规范

1. **使用 ES6+ 语法**
   ```javascript
   // 使用 const/let，避免 var
   const config = {};
   let counter = 0;

   // 使用箭头函数
   const handler = (data) => data.value;

   // 使用解构赋值
   const { symbol, price } = order;
   ```

2. **异步编程**
   ```javascript
   // 使用 async/await
   async function fetchData() {
     try {
       const result = await api.getData();
       return result;
     } catch (error) {
       logger.error('Failed to fetch data', error);
       throw error;
     }
   }
   ```

3. **错误处理**
   ```javascript
   // 统一错误处理
   class TradingError extends Error {
     constructor(message, code, context) {
       super(message);
       this.code = code;
       this.context = context;
     }
   }
   ```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `OrderExecutor` |
| 函数/方法 | camelCase | `calculatePosition` |
| 常量 | UPPER_SNAKE_CASE | `MAX_POSITION_SIZE` |
| 文件名 | PascalCase (类) / camelCase (工具) | `BaseStrategy.js` / `helpers.js` |

### 日志规范

```javascript
// 使用统一的日志接口
const logger = require('./utils/logger');

// 日志级别
logger.debug('详细调试信息');
logger.info('一般运行信息');
logger.warn('警告信息');
logger.error('错误信息', { error, context });
```

---

## 模块详解

### 行情数据引擎 (MarketDataEngine)

```javascript
class MarketDataEngine extends EventEmitter {
  constructor(config) {
    this.exchanges = {};
    this.subscriptions = new Map();
  }

  // 订阅行情数据
  async subscribe(exchange, symbol, channels) {
    // channels: ['ticker', 'orderbook', 'trades', 'kline']
  }

  // 事件
  on('ticker', (data) => {});
  on('orderbook', (data) => {});
  on('kline', (data) => {});
}
```

### 订单执行器 (SmartOrderExecutor)

```javascript
class SmartOrderExecutor {
  constructor(config) {
    this.exchanges = {};
    this.riskManager = null;
  }

  // 执行订单
  async executeOrder(order) {
    // 1. 风控检查
    // 2. 选择最优交易所
    // 3. 执行订单
    // 4. 监控执行状态
    // 5. 处理失败重试
  }

  // 支持的订单类型
  const ORDER_TYPE = {
    MARKET: 'market',
    LIMIT: 'limit',
    STOP_LOSS: 'stop_loss'
  };
}
```

### 风控系统 (RiskSystem)

```javascript
class RiskSystem {
  constructor(config) {
    this.riskManager = new RiskManager();
    this.blackSwanProtector = new BlackSwanProtector();
    this.circuitBreaker = new CircuitBreaker();
  }

  // 订单前检查
  async preOrderCheck(order) {
    return {
      allowed: true,
      adjustedSize: order.size,
      warnings: []
    };
  }

  // 风控指标
  getMetrics() {
    return {
      totalExposure: 0,
      dailyPnL: 0,
      drawdown: 0,
      positionCount: 0
    };
  }
}
```

### 市场状态检测器 (MarketRegimeDetector)

```javascript
const { MarketRegimeDetector, MarketRegime } = require('./utils/MarketRegimeDetector');

class MarketRegimeDetector extends EventEmitter {
  constructor(config) {
    // ADX 参数 (趋势强度)
    this.adxTrendThreshold = 25;     // ADX > 25 认为有趋势
    this.adxStrongTrendThreshold = 40;

    // 波动率阈值
    this.lowVolPercentile = 25;
    this.highVolPercentile = 75;
    this.extremeVolPercentile = 95;

    // Hurst 指数阈值
    this.hurstTrendThreshold = 0.55;  // H > 0.55 趋势特性
    this.hurstMeanRevThreshold = 0.45; // H < 0.45 均值回归
  }

  // 更新市场状态
  update(candle, history) {
    return {
      regime: 'trending_up' | 'trending_down' | 'ranging' | 'high_volatility' | 'extreme',
      confidence: 0-100,
      indicators: { adx, bbWidth, atr, hurst, ... },
      recommendation: { strategies: [...], positionSizing: 0-1 }
    };
  }

  // 市场状态枚举
  const MarketRegime = {
    TRENDING_UP: 'trending_up',       // 上涨趋势 → SMA/MACD
    TRENDING_DOWN: 'trending_down',   // 下跌趋势 → SMA/MACD
    RANGING: 'ranging',               // 震荡盘整 → Grid/RSI/布林
    HIGH_VOLATILITY: 'high_volatility', // 高波动 → ATR突破
    EXTREME: 'extreme',               // 极端情况 → 风控模式
  };

  // 事件
  on('regime_change', ({ from, to, indicators }) => {});
  on('extreme_detected', (data) => {});
  on('volatility_spike', (data) => {});
}
```

### Regime 切换元策略 (RegimeSwitchingStrategy)

```javascript
const { RegimeSwitchingStrategy } = require('./strategies');

class RegimeSwitchingStrategy extends BaseStrategy {
  constructor(config) {
    // 自动根据市场状态切换策略组合
    this.regimeMap = {
      'trending_up': { strategies: ['SMA', 'MACD'], weights: { SMA: 0.6, MACD: 0.4 } },
      'trending_down': { strategies: ['SMA', 'MACD'], weights: { SMA: 0.6, MACD: 0.4 } },
      'ranging': { strategies: ['RSI', 'BollingerBands', 'Grid'], weights: { ... } },
      'high_volatility': { strategies: ['ATRBreakout'], weights: { ATRBreakout: 1.0 } },
      'extreme': { strategies: [], weights: {} }, // 停止交易
    };

    // 信号聚合模式
    this.signalAggregation = 'weighted' | 'majority' | 'any';

    // 风控设置
    this.closeOnRegimeChange = true;  // 状态切换时平仓
    this.forceCloseOnExtreme = true;  // 极端情况强制平仓
  }

  // 使用示例
  const strategy = new RegimeSwitchingStrategy({
    symbol: 'BTC/USDT',
    positionPercent: 95,
    signalAggregation: 'weighted',
    weightedThreshold: 0.5,
  });
}
```

---

## 扩展开发

### 添加新交易所

1. 创建交易所类继承 `BaseExchange`：

```javascript
// src/exchange/NewExchange.js
const BaseExchange = require('./BaseExchange');

class NewExchange extends BaseExchange {
  constructor(config) {
    super(config);
    this.name = 'NewExchange';
  }

  async connect() {
    // 建立连接
  }

  async fetchBalance() {
    // 获取余额
  }

  async createOrder(order) {
    // 创建订单
  }

  async cancelOrder(orderId) {
    // 取消订单
  }
}

module.exports = NewExchange;
```

2. 在 `ExchangeFactory` 中注册：

```javascript
// src/exchange/ExchangeFactory.js
const NewExchange = require('./NewExchange');

ExchangeFactory.register('newexchange', NewExchange);
```

### 添加新策略

详见 [策略开发指南](./STRATEGY_DEVELOPMENT.md)

### 添加新技术指标

```javascript
// src/utils/indicators.js
function customIndicator(data, params) {
  // 实现自定义指标逻辑
  return indicatorValue;
}

module.exports = { customIndicator };
```

---

## 测试

### 测试统计

| 类别 | 文件数 | 测试用例数 |
|------|--------|------------|
| 单元测试 (unit) | 64 | ~3500+ |
| 集成测试 (integration) | 7 | ~150+ |
| 端到端测试 (e2e) | 10 | ~250+ |
| 基准测试 (benchmark) | 2 | ~20 |
| **总计** | **87** | **~4200+** |

### 覆盖率目标

| 指标 | 阈值 |
|------|------|
| 语句覆盖率 (Statements) | 60% |
| 分支覆盖率 (Branches) | 50% |
| 函数覆盖率 (Functions) | 60% |
| 行覆盖率 (Lines) | 60% |

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行集成测试
pnpm test:integration

# 测试覆盖率报告
pnpm test:coverage

# 监听模式（开发时使用）
pnpm test:watch

# 可视化测试界面
pnpm test:ui
```

### 测试结构

```
tests/
├── unit/              # 单元测试 (64 文件)
│   ├── strategies/    # 策略测试
│   ├── risk/          # 风控测试
│   ├── executionAlpha/# 执行 Alpha 测试
│   └── ...            # 其他模块测试
├── integration/       # 集成测试 (7 文件)
├── e2e/               # 端到端测试 (10 文件)
└── benchmark/         # 基准测试 (2 文件)
```

---

## 常见开发问题

### Q: 如何调试策略？

使用回测模式运行策略，启用详细日志：

```bash
LOG_LEVEL=debug npm run backtest
```

### Q: 如何处理高精度计算？

使用 `Decimal.js` 进行金融计算：

```javascript
const Decimal = require('decimal.js');

const price = new Decimal('50000.12345678');
const amount = new Decimal('0.001');
const total = price.times(amount);
```

### Q: 如何添加自定义告警？

```javascript
const { AlertManager } = require('./logger');

alertManager.sendAlert({
  level: 'warning',
  title: '自定义告警',
  message: '告警详情',
  data: { key: 'value' }
});
```

---

## 参考资料

- [API 参考文档](./API_REFERENCE.md)
- [策略开发指南](./STRATEGY_DEVELOPMENT.md)
- [部署运维手册](./DEPLOYMENT_GUIDE.md)
- [故障排查指南](./TROUBLESHOOTING.md)
