# API 参考文档

## 目录

1. [概述](#1-概述)
2. [认证授权](#2-认证授权)
3. [通用说明](#3-通用说明)
4. [仪表板 API](#4-仪表板-api)
5. [策略管理 API](#5-策略管理-api)
6. [交易记录 API](#6-交易记录-api)
7. [持仓管理 API](#7-持仓管理-api)
8. [风控配置 API](#8-风控配置-api)
9. [交易所管理 API](#9-交易所管理-api)
10. [系统管理 API](#10-系统管理-api)
11. [用户管理 API](#11-用户管理-api)
12. [WebSocket API](#12-websocket-api)
13. [错误码参考](#13-错误码参考)

---

## 1. 概述

### 1.1 基础信息

| 项目 | 说明 |
|------|------|
| 基础 URL | `http://localhost:3000/api` |
| 协议 | HTTP/HTTPS |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |
| 时间格式 | ISO 8601 / Unix 时间戳 (ms) |

### 1.2 请求格式

```http
POST /api/strategies HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "My Strategy",
  "type": "sma"
}
```

### 1.3 响应格式

**成功响应：**

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**分页响应：**

```json
{
  "success": true,
  "data": [ ... ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**错误响应：**

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "requestId": "req_xxx"
}
```

---

## 2. 认证授权

### 2.1 登录

**POST** `/api/auth/login`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**请求示例：**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user_1",
      "username": "admin",
      "role": "admin",
      "email": "admin@example.com"
    }
  }
}
```

### 2.2 登出

**POST** `/api/auth/logout`

**请求头：**

```
Authorization: Bearer <token>
```

**响应示例：**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 2.3 刷新 Token

**POST** `/api/auth/refresh`

**请求参数：**

```json
{
  "refreshToken": "refresh_token_here"
}
```

### 2.4 Token 使用

所有需要认证的接口需在请求头中携带 Token：

```
Authorization: Bearer <your_jwt_token>
```

Token 有效期：24 小时

---

## 3. 通用说明

### 3.1 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量（最大 100） |

### 3.2 排序参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| sortBy | string | - | 排序字段 |
| sortOrder | string | desc | 排序方向：asc/desc |

### 3.3 限流规则

| 接口类型 | 限制 | 窗口 |
|---------|------|------|
| 登录 | 5 次 | 15 分钟 |
| 普通查询 | 60 次 | 1 分钟 |
| 交易操作 | 20 次 | 1 分钟 |
| 导出 | 10 次 | 1 小时 |

超限响应：

```json
{
  "success": false,
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

### 3.4 权限角色

| 角色 | 说明 | 权限 |
|------|------|------|
| admin | 管理员 | 所有权限 |
| trader | 交易员 | 策略/交易/持仓操作 |
| analyst | 分析师 | 只读 + 回测 |
| viewer | 访客 | 只读 |

---

## 4. 仪表板 API

### 4.1 获取仪表板摘要

**GET** `/api/dashboard/summary`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "totalAssets": 100000,
    "availableBalance": 50000,
    "positionValue": 50000,
    "todayPnL": 1500,
    "todayPnLPercent": 1.5,
    "totalPnL": 15000,
    "totalPnLPercent": 15,
    "runningStrategies": 3,
    "totalStrategies": 5,
    "openPositions": 4,
    "todayTrades": 12
  }
}
```

### 4.2 获取盈亏曲线

**GET** `/api/dashboard/pnl`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | string | 7d | 时间周期：1d/7d/30d/90d |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "dates": ["2024-01-01", "2024-01-02", ...],
    "values": [100, 250, -50, ...],
    "cumulative": [100, 350, 300, ...]
  }
}
```

### 4.3 获取最近交易

**GET** `/api/dashboard/recent-trades`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 10 | 返回数量 |

### 4.4 获取告警

**GET** `/api/dashboard/alerts`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 5 | 返回数量 |

### 4.5 获取系统指标

**GET** `/api/dashboard/system-metrics`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "cpu": { "usage": 25.5 },
    "memory": {
      "used": 512000000,
      "total": 1024000000,
      "percent": 50
    },
    "uptime": 86400,
    "latency": 35,
    "timestamp": 1703318400000
  }
}
```

---

## 5. 策略管理 API

### 5.1 获取策略列表

**GET** `/api/strategies`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 |
| status | string | - | 状态筛选：running/stopped |
| keyword | string | - | 关键词搜索 |

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "strategy_1",
      "name": "BTC SMA Strategy",
      "type": "sma",
      "symbol": "BTC/USDT",
      "exchange": "binance",
      "state": "running",
      "initialCapital": 10000,
      "params": { "fastPeriod": 10, "slowPeriod": 20 },
      "totalReturn": 15.5,
      "todayReturn": 1.2,
      "trades": 45,
      "winRate": 55.5,
      "createdAt": 1703232000000,
      "updatedAt": 1703318400000
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

### 5.2 获取策略类型

**GET** `/api/strategies/types`

**响应示例：**

```json
{
  "success": true,
  "data": ["SMA", "RSI", "BollingerBands", "MACD", "Grid", "FundingArb"]
}
```

### 5.3 获取策略详情

**GET** `/api/strategies/:id`

### 5.4 创建策略

**POST** `/api/strategies`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 策略名称 |
| type | string | 是 | 策略类型 |
| symbol | string | 是 | 交易对 |
| exchange | string | 否 | 交易所（默认 binance） |
| initialCapital | number | 否 | 初始资金（默认 10000） |
| params | object | 否 | 策略参数 |

**请求示例：**

```json
{
  "name": "My BTC Strategy",
  "type": "sma",
  "symbol": "BTC/USDT",
  "exchange": "binance",
  "initialCapital": 10000,
  "params": {
    "fastPeriod": 10,
    "slowPeriod": 20,
    "stopLoss": 0.02,
    "takeProfit": 0.04
  }
}
```

### 5.5 更新策略

**PUT** `/api/strategies/:id`

**注意：** 运行中的策略无法更新，需先停止。

### 5.6 删除策略

**DELETE** `/api/strategies/:id`

**注意：** 运行中的策略无法删除，需先停止。

### 5.7 启动策略

**POST** `/api/strategies/:id/start`

**响应示例：**

```json
{
  "success": true,
  "message": "Strategy started"
}
```

### 5.8 停止策略

**POST** `/api/strategies/:id/stop`

### 5.9 获取策略统计

**GET** `/api/strategies/:id/stats`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "totalReturn": 15.5,
    "todayReturn": 1.2,
    "trades": 45,
    "winRate": 55.5,
    "maxDrawdown": 8.5,
    "sharpeRatio": 1.85,
    "profitFactor": 1.65
  }
}
```

### 5.10 执行回测

**POST** `/api/strategies/:id/backtest`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 是 | 开始日期 |
| endDate | string | 是 | 结束日期 |
| initialCapital | number | 否 | 初始资金 |

**请求示例：**

```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-06-30",
  "initialCapital": 10000
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "strategyId": "strategy_1",
    "startDate": "2024-01-01",
    "endDate": "2024-06-30",
    "initialCapital": 10000,
    "finalCapital": 12500,
    "totalReturn": 25,
    "maxDrawdown": 12.5,
    "sharpeRatio": 1.65,
    "trades": 78,
    "winRate": 52.5,
    "profitFactor": 1.45,
    "completedAt": 1703318400000
  }
}
```

---

## 6. 交易记录 API

### 6.1 获取交易列表

**GET** `/api/trades`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 |
| symbol | string | - | 交易对筛选 |
| side | string | - | 方向筛选：buy/sell |
| strategy | string | - | 策略筛选 |
| startDate | string | - | 开始日期 |
| endDate | string | - | 结束日期 |
| sortBy | string | timestamp | 排序字段 |
| sortOrder | string | desc | 排序方向 |

### 6.2 获取交易统计

**GET** `/api/trades/stats`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| startDate | string | 开始日期 |
| endDate | string | 结束日期 |
| symbol | string | 交易对 |
| strategy | string | 策略 |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "totalTrades": 150,
    "buyCount": 80,
    "sellCount": 70,
    "totalVolume": 500000,
    "totalFees": 500,
    "totalPnL": 15000,
    "winCount": 85,
    "lossCount": 65,
    "winRate": 56.67,
    "avgPnL": 100,
    "avgWin": 350,
    "avgLoss": -200
  }
}
```

### 6.3 获取交易详情

**GET** `/api/trades/:id`

### 6.4 导出交易数据

**GET** `/api/trades/export`

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| format | string | csv | 导出格式：csv/json |
| startDate | string | - | 开始日期 |
| endDate | string | - | 结束日期 |
| symbol | string | - | 交易对 |
| strategy | string | - | 策略 |

**响应：**

- `format=csv`: 返回 CSV 文件下载
- `format=json`: 返回 JSON 数据

### 6.5 获取订单列表

**GET** `/api/trades/orders`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 状态筛选 |
| symbol | string | 交易对 |

### 6.6 获取未完成订单

**GET** `/api/trades/orders/open`

---

## 7. 持仓管理 API

### 7.1 获取持仓列表

**GET** `/api/positions`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| symbol | string | 交易对筛选 |
| exchange | string | 交易所筛选 |
| minValue | number | 最小市值筛选 |

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "pos_1",
      "symbol": "BTC/USDT",
      "exchange": "binance",
      "side": "long",
      "amount": 0.5,
      "avgPrice": 40000,
      "currentPrice": 42000,
      "currentValue": 21000,
      "unrealizedPnL": 1000,
      "unrealizedPnLPercent": 5,
      "leverage": 1,
      "strategyId": "strategy_1"
    }
  ]
}
```

### 7.2 获取持仓详情

**GET** `/api/positions/:id`

### 7.3 平仓

**POST** `/api/positions/:id/close`

**权限要求：** trader 或 admin

**请求参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| percentage | number | 100 | 平仓比例（1-100） |

**请求示例：**

```json
{
  "percentage": 50
}
```

### 7.4 全部平仓

**POST** `/api/positions/close-all`

**权限要求：** admin

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| exchange | string | 交易所筛选（可选） |
| symbol | string | 交易对筛选（可选） |

### 7.5 获取持仓汇总

**GET** `/api/positions/summary`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "totalPositions": 5,
    "totalValue": 100000,
    "totalUnrealizedPnL": 5000,
    "byExchange": {
      "binance": { "count": 3, "value": 60000, "pnl": 3000 },
      "okx": { "count": 2, "value": 40000, "pnl": 2000 }
    },
    "bySymbol": {
      "BTC/USDT": { "count": 2, "value": 50000, "pnl": 2500 }
    }
  }
}
```

---

## 8. 风控配置 API

### 8.1 获取风控配置

**GET** `/api/risk/config`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "maxLossPerTrade": 0.02,
    "maxDailyLoss": 0.05,
    "maxPositions": 10,
    "maxPositionSize": 0.2,
    "maxLeverage": 3,
    "defaultStopLoss": 0.05,
    "defaultTakeProfit": 0.1,
    "enableTrailingStop": false,
    "trailingStopDistance": 0.03,
    "cooldownPeriod": 60000,
    "state": {
      "tradingAllowed": true,
      "dailyPnL": -500,
      "dailyTradeCount": 15,
      "currentPositions": 3,
      "consecutiveLosses": 2,
      "lastTradeTime": 1703318400000,
      "triggerCount": 0
    }
  }
}
```

### 8.2 更新风控配置

**PUT** `/api/risk/config`

**权限要求：** admin

**请求参数：**

| 参数 | 类型 | 范围 | 说明 |
|------|------|------|------|
| maxLossPerTrade | number | 0.001-0.5 | 单笔最大亏损 |
| maxDailyLoss | number | 0.01-1 | 单日最大亏损 |
| maxPositions | number | 1-100 | 最大持仓数 |
| maxPositionSize | number | 0.01-1 | 单仓位最大占比 |
| maxLeverage | number | 1-125 | 最大杠杆 |
| defaultStopLoss | number | 0.001-0.5 | 默认止损 |
| defaultTakeProfit | number | 0.001-1 | 默认止盈 |
| enableTrailingStop | boolean | - | 启用追踪止损 |
| trailingStopDistance | number | 0.001-0.5 | 追踪止损距离 |
| cooldownPeriod | number | 0-3600000 | 冷却期（ms） |

### 8.3 获取风控限制

**GET** `/api/risk/limits`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "maxDailyTrades": 100,
    "maxConsecutiveLosses": 5,
    "maxOrderAmount": 10000,
    "blacklistedSymbols": ["LUNA/USDT"]
  }
}
```

### 8.4 更新风控限制

**PUT** `/api/risk/limits`

**权限要求：** admin

### 8.5 获取告警列表

**GET** `/api/risk/alerts`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页数量 |
| level | string | 告警级别：info/warning/critical |
| dismissed | boolean | 是否已消除 |

### 8.6 消除告警

**POST** `/api/risk/alerts/:id/dismiss`

### 8.7 启用交易

**POST** `/api/risk/trading/enable`

**权限要求：** admin

### 8.8 禁用交易

**POST** `/api/risk/trading/disable`

**权限要求：** admin

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| reason | string | 禁用原因（可选） |

---

## 9. 交易所管理 API

### 9.1 获取交易所列表

**GET** `/api/exchanges`

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "binance",
      "name": "Binance",
      "status": "connected",
      "apiKey": "abc12345******"
    },
    {
      "id": "okx",
      "name": "OKX",
      "status": "disconnected",
      "apiKey": null
    }
  ]
}
```

### 9.2 获取交易所详情

**GET** `/api/exchanges/:id`

### 9.3 更新交易所配置

**PUT** `/api/exchanges/:id`

**权限要求：** admin

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| apiKey | string | API Key |
| secret | string | API Secret |
| passphrase | string | 密码（OKX） |
| testnet | boolean | 使用测试网 |

### 9.4 测试交易所连接

**POST** `/api/exchanges/:id/test`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "latency": 125,
    "serverTime": "2024-01-15T10:30:00Z"
  }
}
```

### 9.5 获取交易所余额

**GET** `/api/exchanges/:id/balance`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "total": {
      "USDT": 10000,
      "BTC": 0.5,
      "ETH": 5
    },
    "free": {
      "USDT": 8000,
      "BTC": 0.3,
      "ETH": 3
    },
    "used": {
      "USDT": 2000,
      "BTC": 0.2,
      "ETH": 2
    }
  }
}
```

### 9.6 获取市场列表

**GET** `/api/exchanges/:id/markets`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| quote | string | 报价货币筛选 |
| type | string | 类型筛选：spot/swap/future |

### 9.7 获取行情数据

**GET** `/api/exchanges/:id/ticker/:symbol`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "symbol": "BTC/USDT",
    "last": 42150.5,
    "bid": 42140,
    "ask": 42160,
    "high": 43000,
    "low": 41500,
    "volume": 15000,
    "change": 2.5,
    "timestamp": 1703318400000
  }
}
```

---

## 10. 系统管理 API

### 10.1 获取系统状态

**GET** `/api/system/status`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "nodeVersion": "v20.10.0",
    "uptime": 86400,
    "memoryUsage": {
      "heapUsed": 150000000,
      "heapTotal": 300000000,
      "rss": 400000000
    },
    "cpuUsage": { "user": 500000, "system": 100000 },
    "timestamp": "2024-01-15T10:30:00Z",
    "mode": "shadow",
    "pid": 12345,
    "engine": {
      "running": true,
      "strategies": 3
    }
  }
}
```

### 10.2 获取系统配置

**GET** `/api/system/config`

### 10.3 更新系统配置

**PUT** `/api/system/config`

**权限要求：** admin

### 10.4 获取系统指标

**GET** `/api/system/metrics`

### 10.5 健康检查

**GET** `/api/health`

**响应示例：**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 86400
}
```

---

## 11. 用户管理 API

### 11.1 获取用户信息

**GET** `/api/user/profile`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "user_1",
    "username": "admin",
    "role": "admin",
    "email": "admin@example.com",
    "createdAt": 1703232000000
  }
}
```

### 11.2 更新用户信息

**PUT** `/api/user/profile`

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| email | string | 邮箱 |
| nickname | string | 昵称 |
| avatar | string | 头像 URL |

### 11.3 修改密码

**POST** `/api/user/change-password`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| oldPassword | string | 是 | 旧密码 |
| newPassword | string | 是 | 新密码（至少 8 位） |

### 11.4 获取用户列表（管理员）

**GET** `/api/users`

**权限要求：** admin

### 11.5 创建用户（管理员）

**POST** `/api/users`

**权限要求：** admin

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| email | string | 否 | 邮箱 |
| role | string | 否 | 角色（默认 viewer） |

### 11.6 删除用户（管理员）

**DELETE** `/api/users/:id`

**权限要求：** admin

---

## 12. WebSocket API

### 12.1 连接

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // 认证
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your_jwt_token'
  }));
};
```

### 12.2 订阅消息

```javascript
// 订阅行情
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'ticker',
  symbol: 'BTC/USDT'
}));

// 订阅策略信号
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'signals'
}));

// 订阅持仓更新
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'positions'
}));
```

### 12.3 消息类型

**行情更新：**

```json
{
  "type": "ticker",
  "data": {
    "symbol": "BTC/USDT",
    "price": 42150.5,
    "change": 2.5,
    "timestamp": 1703318400000
  }
}
```

**策略信号：**

```json
{
  "type": "signal",
  "data": {
    "strategyId": "strategy_1",
    "signal": "buy",
    "symbol": "BTC/USDT",
    "reason": "Golden cross",
    "timestamp": 1703318400000
  }
}
```

**持仓更新：**

```json
{
  "type": "position",
  "data": {
    "id": "pos_1",
    "symbol": "BTC/USDT",
    "pnl": 1500,
    "pnlPercent": 3.5
  }
}
```

---

## 13. 错误码参考

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| UNAUTHORIZED | 401 | 未认证或 Token 无效 |
| FORBIDDEN | 403 | 权限不足 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 参数验证失败 |
| RATE_LIMIT_EXCEEDED | 429 | 请求过于频繁 |
| STRATEGY_RUNNING | 400 | 策略运行中，无法操作 |
| NOT_RUNNING | 400 | 策略未运行 |
| ALREADY_RUNNING | 400 | 策略已在运行 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

*文档版本: 1.0.0*
*最后更新: 2024-12-23*
