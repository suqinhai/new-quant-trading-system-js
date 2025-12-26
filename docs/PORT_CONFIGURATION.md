# 端口配置文档 / Port Configuration Guide

> 本文档详细说明了量化交易系统在不同运行模式下所需开放的端口配置。
> This document details the port configuration required for the quantitative trading system in different running modes.

---

## 目录 / Table of Contents

1. [端口类型说明](#一端口类型说明)
2. [PM2:Shadow 模式端口](#二pm2shadow-模式端口清单)
3. [PM2:Live 模式端口](#三pm2live-模式端口清单)
4. [外部依赖服务端口](#四外部依赖服务端口)
5. [快速参考](#五快速参考---端口范围汇总)
6. [防火墙配置](#六防火墙配置)
7. [Docker 配置](#七docker-配置)
8. [常见问题](#八常见问题)

---

## 一、端口类型说明

每个策略实例需要 **4 个端口**：

| 端口类型 | 环境变量 | 用途 | 协议 |
|----------|----------|------|------|
| **HTTP_PORT** | `HTTP_PORT` | REST API 服务 (Express) | HTTP/TCP |
| **WS_PORT** | `WS_PORT` / `MARKETDATA_PORT` | WebSocket 行情推送 (Socket.io) | WS/TCP |
| **DASHBOARD_PORT** | `DASHBOARD_PORT` | Web 监控面板 | HTTP/TCP |
| **METRICS_PORT** | `METRICS_PORT` | Prometheus 指标导出 | HTTP/TCP |

### 端口分配规则

```
Live 模式:
  HTTP_PORT     = 3000 + (策略索引 × 10)
  WS_PORT       = HTTP_PORT + 1
  DASHBOARD     = 8080 + 策略索引
  METRICS       = 9090 + 策略索引

Shadow 模式:
  HTTP_PORT     = 3100 + (策略索引 × 10)
  WS_PORT       = HTTP_PORT + 1
  DASHBOARD     = 8180 + 策略索引
  METRICS       = 9190 + 策略索引
```

---

## 二、PM2:Shadow 模式端口清单

**命令**: `npm run pm2:shadow`

共 21 个策略实例，每个需要 4 个端口：

| # | 策略名称 | 应用名 | HTTP | WS | Dashboard | Metrics |
|---|----------|--------|------|-----|-----------|---------|
| 0 | FundingArb | quant-shadow-funding | 3100 | 3101 | 8180 | 9190 |
| 1 | Grid | quant-shadow-grid | 3110 | 3111 | 8181 | 9191 |
| 2 | SMA | quant-shadow-sma | 3120 | 3121 | 8182 | 9192 |
| 3 | RSI | quant-shadow-rsi | 3130 | 3131 | 8183 | 9193 |
| 4 | MACD | quant-shadow-macd | 3140 | 3141 | 8184 | 9194 |
| 5 | BollingerBands | quant-shadow-bb | 3150 | 3151 | 8185 | 9195 |
| 6 | ATRBreakout | quant-shadow-atr | 3160 | 3161 | 8186 | 9196 |
| 7 | BollingerWidth | quant-shadow-bbwidth | 3170 | 3171 | 8187 | 9197 |
| 8 | VolatilityRegime | quant-shadow-regime | 3180 | 3181 | 8188 | 9198 |
| 9 | OrderFlow | quant-shadow-orderflow | 3190 | 3191 | 8189 | 9199 |
| 10 | MultiTimeframe | quant-shadow-mtf | 3200 | 3201 | 8190 | 9200 |
| 11 | WeightedCombo | quant-shadow-combo | 3210 | 3211 | 8191 | 9201 |
| 12 | CrossSectional | quant-shadow-crosssectional | 3220 | 3221 | 8192 | 9202 |
| 13 | MomentumRank | quant-shadow-momentumrank | 3230 | 3231 | 8193 | 9203 |
| 14 | Rotation | quant-shadow-rotation | 3240 | 3241 | 8194 | 9204 |
| 15 | FundingRateExtreme | quant-shadow-fundingextreme | 3250 | 3251 | 8195 | 9205 |
| 16 | CrossExchangeSpread | quant-shadow-crossexchange | 3260 | 3261 | 8196 | 9206 |
| 17 | StatisticalArbitrage | quant-shadow-statarb | 3270 | 3271 | 8197 | 9207 |
| 18 | RiskDriven | quant-shadow-riskdriven | 3280 | 3281 | 8198 | 9208 |
| 19 | Adaptive | quant-shadow-adaptive | 3290 | 3291 | 8199 | 9209 |
| 20 | FactorInvesting | quant-shadow-factors | 3300 | 3301 | 8200 | 9210 |

### Shadow 模式端口范围汇总

| 服务类型 | 端口范围 | 数量 |
|----------|----------|------|
| HTTP API | 3100-3300 (步长10) | 21 |
| WebSocket | 3101-3301 (步长10) | 21 |
| Dashboard | 8180-8200 | 21 |
| Metrics | 9190-9210 | 21 |

---

## 三、PM2:Live 模式端口清单

**命令**: `npm run pm2:live`

共 21 个策略实例，每个需要 4 个端口：

| # | 策略名称 | 应用名 | HTTP | WS | Dashboard | Metrics |
|---|----------|--------|------|-----|-----------|---------|
| 0 | FundingArb | quant-live-funding | 3000 | 3001 | 8080 | 9090 |
| 1 | Grid | quant-live-grid | 3010 | 3011 | 8081 | 9091 |
| 2 | SMA | quant-live-sma | 3020 | 3021 | 8082 | 9092 |
| 3 | RSI | quant-live-rsi | 3030 | 3031 | 8083 | 9093 |
| 4 | MACD | quant-live-macd | 3040 | 3041 | 8084 | 9094 |
| 5 | BollingerBands | quant-live-bb | 3050 | 3051 | 8085 | 9095 |
| 6 | ATRBreakout | quant-live-atr | 3060 | 3061 | 8086 | 9096 |
| 7 | BollingerWidth | quant-live-bbwidth | 3070 | 3071 | 8087 | 9097 |
| 8 | VolatilityRegime | quant-live-regime | 3080 | 3081 | 8088 | 9098 |
| 9 | OrderFlow | quant-live-orderflow | 3090 | 3091 | 8089 | 9099 |
| 10 | MultiTimeframe | quant-live-mtf | 3100 | 3101 | 8090 | 9100 |
| 11 | WeightedCombo | quant-live-combo | 3110 | 3111 | 8091 | 9101 |
| 12 | CrossSectional | quant-live-crosssectional | 3120 | 3121 | 8092 | 9102 |
| 13 | MomentumRank | quant-live-momentumrank | 3130 | 3131 | 8093 | 9103 |
| 14 | Rotation | quant-live-rotation | 3140 | 3141 | 8094 | 9104 |
| 15 | FundingRateExtreme | quant-live-fundingextreme | 3150 | 3151 | 8095 | 9105 |
| 16 | CrossExchangeSpread | quant-live-crossexchange | 3160 | 3161 | 8096 | 9106 |
| 17 | StatisticalArbitrage | quant-live-statarb | 3170 | 3171 | 8097 | 9107 |
| 18 | RiskDriven | quant-live-riskdriven | 3180 | 3181 | 8098 | 9108 |
| 19 | Adaptive | quant-live-adaptive | 3190 | 3191 | 8099 | 9109 |
| 20 | FactorInvesting | quant-live-factors | 3200 | 3201 | 8100 | 9110 |

### Live 模式端口范围汇总

| 服务类型 | 端口范围 | 数量 |
|----------|----------|------|
| HTTP API | 3000-3200 (步长10) | 21 |
| WebSocket | 3001-3201 (步长10) | 21 |
| Dashboard | 8080-8100 | 21 |
| Metrics | 9090-9110 | 21 |

---

## 四、外部依赖服务端口

### 必需服务 (Required Services)

| 服务 | 端口 | 方向 | 协议 | 环境变量 | 说明 |
|------|------|------|------|----------|------|
| **Redis** | 6379 | 出站 | TCP | `REDIS_PORT` | 缓存、实时数据、消息队列 |
| **ClickHouse** | 8123 | 出站 | HTTP | `CLICKHOUSE_PORT` | 历史数据分析、订单归档 |

### 交易所 API (Exchange APIs)

| 交易所 | REST API | WebSocket | 方向 | 说明 |
|--------|----------|-----------|------|------|
| **Binance** | 443 (HTTPS) | 443 (WSS) | 出站 | fapi.binance.com / fstream.binance.com |
| **OKX** | 443 (HTTPS) | 443 (WSS) | 出站 | www.okx.com |
| **Bybit** | 443 (HTTPS) | 443 (WSS) | 出站 | api.bybit.com |

### 通知服务 (Notification Services)

| 服务 | 端口 | 方向 | 协议 | 环境变量 | 说明 |
|------|------|------|------|----------|------|
| **SMTP (QQ邮箱)** | 587 | 出站 | TCP/TLS | `SMTP_PORT` | 邮件告警通知 |
| **Telegram API** | 443 | 出站 | HTTPS | - | Telegram 机器人推送 |
| **钉钉 Webhook** | 443 | 出站 | HTTPS | - | 钉钉机器人通知 |

---

## 五、快速参考 - 端口范围汇总

### PM2:Shadow 模式

```
┌────────────────────────────────────────────────────────────────────┐
│                      PM2:SHADOW 模式                               │
│                    npm run pm2:shadow                              │
├────────────────────────────────────────────────────────────────────┤
│ TCP 入站 (Inbound):                                                │
│   • 3100-3309    HTTP + WebSocket (策略服务)                        │
│   • 8180-8200    Dashboard (监控面板)                               │
│   • 9190-9210    Prometheus Metrics (指标)                         │
├────────────────────────────────────────────────────────────────────┤
│ TCP 出站 (Outbound):                                               │
│   • 6379         Redis                                             │
│   • 8123         ClickHouse                                        │
│   • 443          HTTPS (交易所/Telegram)                            │
│   • 587          SMTP (邮件告警)                                    │
└────────────────────────────────────────────────────────────────────┘
```

### PM2:Live 模式

```
┌────────────────────────────────────────────────────────────────────┐
│                       PM2:LIVE 模式                                │
│                     npm run pm2:live                               │
├────────────────────────────────────────────────────────────────────┤
│ TCP 入站 (Inbound):                                                │
│   • 3000-3209    HTTP + WebSocket (策略服务)                        │
│   • 8080-8100    Dashboard (监控面板)                               │
│   • 9090-9110    Prometheus Metrics (指标)                         │
├────────────────────────────────────────────────────────────────────┤
│ TCP 出站 (Outbound):                                               │
│   • 6379         Redis                                             │
│   • 8123         ClickHouse                                        │
│   • 443          HTTPS (交易所/Telegram)                            │
│   • 587          SMTP (邮件告警)                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 六、防火墙配置

### Linux (UFW)

```bash
#!/bin/bash
# ============================================
# Shadow 模式防火墙配置
# ============================================

# HTTP + WebSocket
sudo ufw allow 3100:3309/tcp comment 'Quant Shadow HTTP+WS'

# Dashboard
sudo ufw allow 8180:8200/tcp comment 'Quant Shadow Dashboard'

# Prometheus Metrics
sudo ufw allow 9190:9210/tcp comment 'Quant Shadow Metrics'

# ============================================
# Live 模式防火墙配置
# ============================================

# HTTP + WebSocket
sudo ufw allow 3000:3209/tcp comment 'Quant Live HTTP+WS'

# Dashboard
sudo ufw allow 8080:8100/tcp comment 'Quant Live Dashboard'

# Prometheus Metrics
sudo ufw allow 9090:9110/tcp comment 'Quant Live Metrics'

# ============================================
# 出站规则 (通常默认允许)
# ============================================

sudo ufw allow out 6379/tcp comment 'Redis'
sudo ufw allow out 8123/tcp comment 'ClickHouse'
sudo ufw allow out 443/tcp comment 'HTTPS'
sudo ufw allow out 587/tcp comment 'SMTP'

# 启用防火墙
sudo ufw enable
sudo ufw status verbose
```

### Linux (iptables)

```bash
#!/bin/bash
# ============================================
# Shadow 模式
# ============================================

# HTTP + WebSocket (3100-3309)
iptables -A INPUT -p tcp --dport 3100:3309 -j ACCEPT

# Dashboard (8180-8200)
iptables -A INPUT -p tcp --dport 8180:8200 -j ACCEPT

# Metrics (9190-9210)
iptables -A INPUT -p tcp --dport 9190:9210 -j ACCEPT

# ============================================
# Live 模式
# ============================================

# HTTP + WebSocket (3000-3209)
iptables -A INPUT -p tcp --dport 3000:3209 -j ACCEPT

# Dashboard (8080-8100)
iptables -A INPUT -p tcp --dport 8080:8100 -j ACCEPT

# Metrics (9090-9110)
iptables -A INPUT -p tcp --dport 9090:9110 -j ACCEPT

# 保存规则
iptables-save > /etc/iptables/rules.v4
```

### Windows 防火墙

```powershell
# ============================================
# Shadow 模式 (PowerShell 管理员)
# ============================================

# HTTP + WebSocket
New-NetFirewallRule -DisplayName "Quant Shadow HTTP+WS" -Direction Inbound -Protocol TCP -LocalPort 3100-3309 -Action Allow

# Dashboard
New-NetFirewallRule -DisplayName "Quant Shadow Dashboard" -Direction Inbound -Protocol TCP -LocalPort 8180-8200 -Action Allow

# Metrics
New-NetFirewallRule -DisplayName "Quant Shadow Metrics" -Direction Inbound -Protocol TCP -LocalPort 9190-9210 -Action Allow

# ============================================
# Live 模式
# ============================================

# HTTP + WebSocket
New-NetFirewallRule -DisplayName "Quant Live HTTP+WS" -Direction Inbound -Protocol TCP -LocalPort 3000-3209 -Action Allow

# Dashboard
New-NetFirewallRule -DisplayName "Quant Live Dashboard" -Direction Inbound -Protocol TCP -LocalPort 8080-8100 -Action Allow

# Metrics
New-NetFirewallRule -DisplayName "Quant Live Metrics" -Direction Inbound -Protocol TCP -LocalPort 9090-9110 -Action Allow
```

---

## 七、Docker 配置

### docker-compose.yml 示例

```yaml
version: '3.8'

services:
  # ============================================
  # 基础设施服务
  # ============================================
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    environment:
      - CLICKHOUSE_USER=${CLICKHOUSE_USERNAME}
      - CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}

  # ============================================
  # 量化交易应用 (Shadow 模式示例)
  # ============================================
  quant-shadow-funding:
    build: .
    command: npm run shadow -- --strategy FundingArb
    ports:
      - "3100:3100"  # HTTP
      - "3101:3101"  # WebSocket
      - "8180:8180"  # Dashboard
      - "9190:9190"  # Metrics
    environment:
      - HTTP_PORT=3100
      - WS_PORT=3101
      - DASHBOARD_PORT=8180
      - METRICS_PORT=9190
    depends_on:
      - redis
      - clickhouse
    env_file:
      - .env

  # ============================================
  # 量化交易应用 (Live 模式示例)
  # ============================================
  quant-live-funding:
    build: .
    command: npm run live -- --strategy FundingArb
    ports:
      - "3000:3000"  # HTTP
      - "3001:3001"  # WebSocket
      - "8080:8080"  # Dashboard
      - "9090:9090"  # Metrics
    environment:
      - HTTP_PORT=3000
      - WS_PORT=3001
      - DASHBOARD_PORT=8080
      - METRICS_PORT=9090
      - NODE_ENV=production
    depends_on:
      - redis
      - clickhouse
    env_file:
      - .env

volumes:
  redis_data:
  clickhouse_data:
```

### 端口映射脚本

```bash
#!/bin/bash
# generate-docker-ports.sh
# 生成所有策略的 Docker 端口映射

STRATEGIES=(
  "funding" "grid" "sma" "rsi" "macd" "bb"
  "atr" "bbwidth" "regime" "orderflow" "mtf" "combo"
  "crosssectional" "momentumrank" "rotation" "fundingextreme"
  "crossexchange" "statarb" "riskdriven" "adaptive" "factors"
)

echo "# Live 模式端口映射"
for i in "${!STRATEGIES[@]}"; do
  strategy="${STRATEGIES[$i]}"
  http=$((3000 + i * 10))
  ws=$((http + 1))
  dashboard=$((8080 + i))
  metrics=$((9090 + i))
  echo "quant-live-${strategy}:"
  echo "  ports:"
  echo "    - \"${http}:${http}\""
  echo "    - \"${ws}:${ws}\""
  echo "    - \"${dashboard}:${dashboard}\""
  echo "    - \"${metrics}:${metrics}\""
  echo ""
done

echo "# Shadow 模式端口映射"
for i in "${!STRATEGIES[@]}"; do
  strategy="${STRATEGIES[$i]}"
  http=$((3100 + i * 10))
  ws=$((http + 1))
  dashboard=$((8180 + i))
  metrics=$((9190 + i))
  echo "quant-shadow-${strategy}:"
  echo "  ports:"
  echo "    - \"${http}:${http}\""
  echo "    - \"${ws}:${ws}\""
  echo "    - \"${dashboard}:${dashboard}\""
  echo "    - \"${metrics}:${metrics}\""
  echo ""
done
```

---

## 八、常见问题

### Q1: 端口被占用怎么办？

```bash
# Linux/Mac: 查看端口占用
lsof -i :3000
netstat -tlnp | grep 3000

# Windows: 查看端口占用
netstat -ano | findstr :3000

# 查找并终止占用进程
kill -9 <PID>
taskkill /PID <PID> /F  # Windows
```

### Q2: 如何只运行部分策略？

```bash
# 只运行 FundingArb 策略 (影子模式)
pm2 start ecosystem.config.cjs --only quant-shadow-funding

# 只运行多个策略
pm2 start ecosystem.config.cjs --only quant-live-funding,quant-live-grid

# 查看当前运行的应用
pm2 status
```

### Q3: 如何修改默认端口？

修改 `ecosystem.config.cjs` 中的端口基数计算逻辑：

```javascript
// 修改端口基数
const livePortBase = 4000 + index * 10;  // 改为从 4000 开始
const shadowPortBase = 4100 + index * 10;
```

或通过环境变量覆盖：

```bash
HTTP_PORT=4000 WS_PORT=4001 npm run shadow
```

### Q4: 云服务器安全组配置

| 云服务商 | 配置位置 |
|----------|----------|
| 阿里云 | 控制台 > ECS > 安全组 > 配置规则 |
| 腾讯云 | 控制台 > CVM > 安全组 > 入站规则 |
| AWS | EC2 > Security Groups > Inbound rules |
| Azure | VM > Networking > Inbound port rules |

添加入站规则示例：
- 协议: TCP
- 端口范围: 3000-3309, 8080-8200, 9090-9210
- 来源: 0.0.0.0/0 (或限制为特定 IP)

---

## 附录: 端口使用一览表

| 端口范围 | 模式 | 用途 |
|----------|------|------|
| 3000-3209 | Live | HTTP API + WebSocket |
| 3100-3309 | Shadow | HTTP API + WebSocket |
| 6379 | - | Redis |
| 8080-8100 | Live | Dashboard 监控面板 |
| 8123 | - | ClickHouse |
| 8180-8200 | Shadow | Dashboard 监控面板 |
| 9090-9110 | Live | Prometheus Metrics |
| 9190-9210 | Shadow | Prometheus Metrics |

---

*文档生成时间: 2025-12-26*
*版本: 1.0.0*
