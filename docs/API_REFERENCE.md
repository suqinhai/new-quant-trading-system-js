# API 参考文档

## 目录

1. [概述](#概述)
2. [认证](#认证)
3. [通用规范](#通用规范)
4. [API 端点](#api-端点)
   - [仪表板 API](#仪表板-api)
   - [策略 API](#策略-api)
   - [交易 API](#交易-api)
   - [持仓 API](#持仓-api)
   - [风控 API](#风控-api)
   - [交易所 API](#交易所-api)
   - [系统 API](#系统-api)
   - [用户 API](#用户-api)
5. [WebSocket API](#websocket-api)
6. [错误处理](#错误处理)
7. [限流说明](#限流说明)

---

## 概述

### 基本信息

| 项目 | 值 |
|------|-----|
| 基础 URL | `http://localhost:3000/api` |
| 协议 | HTTP/HTTPS |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

### 服务端口

| 服务 | 端口 | 用途 |
|------|------|------|
| HTTP API | 3000 | REST API 服务 |
| WebSocket | 3000 | 实时数据推送 |
| Metrics | 9090 | Prometheus 指标 |

---

## 认证

### JWT 认证

系统使用 JWT (JSON Web Token) 进行身份验证。

#### 获取 Token

```http
POST /api/user/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

#### 使用 Token

在请求头中添加 Authorization：

```http
Authorization: Bearer <token>
```

### 用户角色

| 角色 | 权限 |
|------|------|
| admin | 完全访问权限 |
| trader | 交易和查看权限 |
| viewer | 只读权限 |

---

## 通用规范

### 请求格式

```http
GET /api/resource
POST /api/resource
PUT /api/resource/:id
DELETE /api/resource/:id
```

### 响应格式

**成功响应：**
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### 分页参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页条数 |
| sort | string | -createdAt | 排序字段 |

**分页响应：**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

## API 端点

### 仪表板 API

#### 获取仪表板数据

```http
GET /api/dashboard
```

**响应：**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBalance": 10500.50,
      "totalPnL": 500.50,
      "totalPnLPercent": 5.0,
      "dailyPnL": 100.25,
      "dailyPnLPercent": 0.96
    },
    "positions": [
      {
        "symbol": "BTC/USDT",
        "side": "long",
        "size": 0.1,
        "entryPrice": 45000,
        "currentPrice": 46000,
        "unrealizedPnL": 100
      }
    ],
    "recentTrades": [...],
    "systemStatus": {
      "status": "running",
      "uptime": 86400,
      "activeStrategies": 3
    }
  }
}
```

#### 获取权益曲线

```http
GET /api/dashboard/equity-curve?period=30d
```

**参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| period | string | 时间范围：1d, 7d, 30d, 90d |

---

### 策略 API

#### 获取策略列表

```http
GET /api/strategies
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "BTC SMA Strategy",
      "type": "SMA",
      "status": "running",
      "symbol": "BTC/USDT",
      "params": {
        "shortPeriod": 10,
        "longPeriod": 30
      },
      "performance": {
        "totalPnL": 1500.00,
        "winRate": 0.65,
        "tradesCount": 50
      },
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### 获取可用策略类型

```http
GET /api/strategies/types
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "type": "SMA",
      "name": "简单移动平均",
      "description": "双均线交叉策略",
      "params": [
        { "name": "shortPeriod", "type": "number", "default": 10 },
        { "name": "longPeriod", "type": "number", "default": 30 }
      ]
    },
    {
      "type": "RSI",
      "name": "相对强度指标",
      "description": "RSI 超买超卖策略",
      "params": [
        { "name": "period", "type": "number", "default": 14 },
        { "name": "overbought", "type": "number", "default": 70 },
        { "name": "oversold", "type": "number", "default": 30 }
      ]
    }
  ]
}
```

#### 获取单个策略

```http
GET /api/strategies/:id
```

#### 创建策略

```http
POST /api/strategies
Content-Type: application/json

{
  "name": "My SMA Strategy",
  "type": "SMA",
  "symbol": "BTC/USDT",
  "timeframe": "1h",
  "params": {
    "shortPeriod": 10,
    "longPeriod": 30
  },
  "risk": {
    "maxPositionSize": 0.1,
    "stopLoss": 0.02,
    "takeProfit": 0.05
  }
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "My SMA Strategy",
    "type": "SMA",
    "status": "stopped",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "message": "策略创建成功"
}
```

#### 更新策略

```http
PUT /api/strategies/:id
Content-Type: application/json

{
  "name": "Updated Strategy Name",
  "params": {
    "shortPeriod": 15
  }
}
```

#### 删除策略

```http
DELETE /api/strategies/:id
```

#### 启动策略

```http
POST /api/strategies/:id/start
```

#### 停止策略

```http
POST /api/strategies/:id/stop
```

#### 获取策略性能

```http
GET /api/strategies/:id/performance
```

**响应：**
```json
{
  "success": true,
  "data": {
    "totalPnL": 1500.00,
    "totalPnLPercent": 15.0,
    "winRate": 0.65,
    "tradesCount": 50,
    "winCount": 32,
    "lossCount": 18,
    "avgWin": 100.50,
    "avgLoss": -50.25,
    "profitFactor": 2.0,
    "maxDrawdown": 0.08,
    "sharpeRatio": 1.8
  }
}
```

---

### 交易 API

#### 获取交易记录

```http
GET /api/trades?page=1&limit=20&symbol=BTC/USDT
```

**参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| page | number | 页码 |
| limit | number | 每页条数 |
| symbol | string | 交易对过滤 |
| strategyId | number | 策略 ID 过滤 |
| startDate | string | 开始日期 |
| endDate | string | 结束日期 |
| side | string | buy/sell |

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "orderId": "ord_123456",
      "symbol": "BTC/USDT",
      "side": "buy",
      "type": "market",
      "price": 45000,
      "amount": 0.1,
      "cost": 4500,
      "fee": 4.5,
      "pnl": null,
      "strategyId": 1,
      "strategyName": "BTC SMA Strategy",
      "executedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### 获取交易统计

```http
GET /api/trades/statistics?period=30d
```

**响应：**
```json
{
  "success": true,
  "data": {
    "totalTrades": 150,
    "buyTrades": 75,
    "sellTrades": 75,
    "totalVolume": 500000,
    "totalFees": 500,
    "totalPnL": 2500,
    "winRate": 0.62,
    "avgTradeSize": 3333.33,
    "tradesBySymbol": {
      "BTC/USDT": 100,
      "ETH/USDT": 50
    }
  }
}
```

---

### 持仓 API

#### 获取当前持仓

```http
GET /api/positions
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "symbol": "BTC/USDT",
      "exchange": "binance",
      "side": "long",
      "size": 0.1,
      "entryPrice": 45000,
      "currentPrice": 46000,
      "markPrice": 45990,
      "liquidationPrice": 40000,
      "leverage": 1,
      "margin": 4500,
      "unrealizedPnL": 100,
      "unrealizedPnLPercent": 2.22,
      "strategyId": 1,
      "openedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 获取单个持仓

```http
GET /api/positions/:id
```

#### 平仓

```http
POST /api/positions/:id/close
Content-Type: application/json

{
  "type": "market",
  "amount": 0.1  // 可选，默认全部平仓
}
```

#### 调整持仓

```http
PUT /api/positions/:id
Content-Type: application/json

{
  "stopLoss": 44000,
  "takeProfit": 50000
}
```

#### 获取持仓历史

```http
GET /api/positions/history?page=1&limit=20
```

---

### 风控 API

#### 获取风控状态

```http
GET /api/risk/status
```

**响应：**
```json
{
  "success": true,
  "data": {
    "status": "normal",
    "level": "green",
    "metrics": {
      "totalExposure": 0.3,
      "totalExposureLimit": 0.5,
      "positionCount": 2,
      "positionCountLimit": 5,
      "dailyPnL": -200,
      "dailyPnLPercent": -2,
      "dailyLossLimit": -500,
      "drawdown": 0.05,
      "maxDrawdown": 0.15,
      "leverage": 1.5,
      "maxLeverage": 3
    },
    "circuitBreaker": {
      "enabled": true,
      "triggered": false,
      "lastTriggered": null,
      "cooldownEnd": null
    },
    "alerts": []
  }
}
```

#### 获取风控告警

```http
GET /api/risk/alerts?status=active
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "level": "warning",
      "type": "daily_loss",
      "message": "日亏损接近限制: -4.5%",
      "threshold": -5,
      "current": -4.5,
      "createdAt": "2024-01-15T14:30:00Z",
      "acknowledgedAt": null
    }
  ]
}
```

#### 确认告警

```http
POST /api/risk/alerts/:id/acknowledge
```

#### 获取风控配置

```http
GET /api/risk/config
```

#### 更新风控配置

```http
PUT /api/risk/config
Content-Type: application/json

{
  "maxDailyLoss": 0.05,
  "maxDrawdown": 0.15,
  "maxPositionCount": 5,
  "maxLeverage": 3,
  "circuitBreaker": {
    "enabled": true,
    "triggerLoss": 0.1,
    "cooldownMinutes": 60
  }
}
```

#### 重置熔断器

```http
POST /api/risk/circuit-breaker/reset
```

---

### 交易所 API

#### 获取交易所连接状态

```http
GET /api/exchanges
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "name": "binance",
      "status": "connected",
      "lastPing": "2024-01-15T14:30:00Z",
      "latency": 50,
      "features": ["spot", "futures", "margin"]
    },
    {
      "name": "bybit",
      "status": "connected",
      "lastPing": "2024-01-15T14:30:00Z",
      "latency": 80
    }
  ]
}
```

#### 获取账户余额

```http
GET /api/exchanges/:name/balance
```

**响应：**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "balances": {
      "USDT": {
        "free": 5000,
        "used": 2000,
        "total": 7000
      },
      "BTC": {
        "free": 0.1,
        "used": 0.05,
        "total": 0.15
      }
    },
    "totalInUSD": 12500.50,
    "updatedAt": "2024-01-15T14:30:00Z"
  }
}
```

#### 获取交易对信息

```http
GET /api/exchanges/:name/markets
```

#### 获取行情数据

```http
GET /api/exchanges/:name/ticker/:symbol
```

**响应：**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC/USDT",
    "bid": 45000,
    "ask": 45010,
    "last": 45005,
    "high": 46000,
    "low": 44000,
    "volume": 10000,
    "change": 2.5,
    "changePercent": 0.5,
    "timestamp": "2024-01-15T14:30:00Z"
  }
}
```

---

### 系统 API

#### 健康检查

```http
GET /api/system/health
```

**响应：**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "1.0.0",
    "components": {
      "database": "healthy",
      "redis": "healthy",
      "exchanges": "healthy"
    }
  }
}
```

#### 获取系统统计

```http
GET /api/system/stats
```

**响应：**
```json
{
  "success": true,
  "data": {
    "cpu": {
      "usage": 25.5,
      "cores": 4
    },
    "memory": {
      "used": 512,
      "total": 2048,
      "usagePercent": 25
    },
    "process": {
      "uptime": 86400,
      "pid": 12345
    },
    "trading": {
      "activeStrategies": 3,
      "openPositions": 2,
      "todayTrades": 15
    }
  }
}
```

#### 获取系统配置

```http
GET /api/system/config
```

#### 更新系统配置

```http
PUT /api/system/config
Content-Type: application/json

{
  "logging": {
    "level": "info"
  },
  "notifications": {
    "telegram": true,
    "email": false
  }
}
```

#### 紧急停止

```http
POST /api/system/emergency-stop
```

**响应：**
```json
{
  "success": true,
  "message": "紧急停止已执行",
  "data": {
    "closedPositions": 2,
    "cancelledOrders": 5,
    "stoppedStrategies": 3
  }
}
```

---

### 用户 API

#### 用户登录

```http
POST /api/user/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password"
}
```

#### 用户登出

```http
POST /api/user/logout
```

#### 获取当前用户信息

```http
GET /api/user/profile
```

#### 更新用户信息

```http
PUT /api/user/profile
Content-Type: application/json

{
  "email": "new@email.com",
  "notifications": {
    "telegram": true,
    "email": true
  }
}
```

#### 修改密码

```http
PUT /api/user/password
Content-Type: application/json

{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

---

## WebSocket API

### 连接

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
```

### 订阅频道

#### 行情数据

```javascript
// 订阅 ticker
socket.emit('subscribe', { channel: 'ticker', symbol: 'BTC/USDT' });

// 接收 ticker 数据
socket.on('ticker', (data) => {
  console.log(data);
  // { symbol: 'BTC/USDT', price: 45000, ... }
});
```

#### 订单更新

```javascript
socket.emit('subscribe', { channel: 'orders' });

socket.on('order', (data) => {
  console.log(data);
  // { orderId: '...', status: 'filled', ... }
});
```

#### 持仓更新

```javascript
socket.emit('subscribe', { channel: 'positions' });

socket.on('position', (data) => {
  console.log(data);
  // { symbol: 'BTC/USDT', unrealizedPnL: 100, ... }
});
```

#### 系统告警

```javascript
socket.emit('subscribe', { channel: 'alerts' });

socket.on('alert', (data) => {
  console.log(data);
  // { level: 'warning', message: '...', ... }
});
```

### 取消订阅

```javascript
socket.emit('unsubscribe', { channel: 'ticker', symbol: 'BTC/USDT' });
```

---

## 错误处理

### 错误码

| 错误码 | HTTP 状态 | 描述 |
|--------|-----------|------|
| AUTH_REQUIRED | 401 | 需要认证 |
| AUTH_INVALID | 401 | 认证无效 |
| AUTH_EXPIRED | 401 | Token 过期 |
| FORBIDDEN | 403 | 权限不足 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 参数验证失败 |
| RATE_LIMITED | 429 | 请求过于频繁 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| EXCHANGE_ERROR | 502 | 交易所错误 |
| SERVICE_UNAVAILABLE | 503 | 服务不可用 |

### 错误响应示例

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数验证失败",
    "details": [
      {
        "field": "symbol",
        "message": "symbol 是必填字段"
      }
    ]
  }
}
```

---

## 限流说明

### 限流规则

| 端点类别 | 限制 | 窗口 |
|----------|------|------|
| 公开 API | 100 次 | 1 分钟 |
| 认证 API | 300 次 | 1 分钟 |
| 交易 API | 60 次 | 1 分钟 |
| WebSocket | 100 消息 | 1 分钟 |

### 限流响应头

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705324800
```

### 超限响应

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁，请稍后重试",
    "retryAfter": 60
  }
}
```

---

## SDK 示例

### Node.js

```javascript
const axios = require('axios');

class TradingClient {
  constructor(baseUrl, token) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getStrategies() {
    const response = await this.client.get('/api/strategies');
    return response.data;
  }

  async createStrategy(strategy) {
    const response = await this.client.post('/api/strategies', strategy);
    return response.data;
  }

  async startStrategy(id) {
    const response = await this.client.post(`/api/strategies/${id}/start`);
    return response.data;
  }
}

// 使用示例
const client = new TradingClient('http://localhost:3000', 'YOUR_TOKEN');
const strategies = await client.getStrategies();
```

### cURL 示例

```bash
# 获取策略列表
curl -X GET http://localhost:3000/api/strategies \
  -H "Authorization: Bearer YOUR_TOKEN"

# 创建策略
curl -X POST http://localhost:3000/api/strategies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Strategy",
    "type": "SMA",
    "symbol": "BTC/USDT",
    "params": {"shortPeriod": 10, "longPeriod": 30}
  }'

# 启动策略
curl -X POST http://localhost:3000/api/strategies/1/start \
  -H "Authorization: Bearer YOUR_TOKEN"
```
