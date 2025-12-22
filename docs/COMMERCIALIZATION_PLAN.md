# 量化交易系统商业化改进计划

> 版本: 1.0.0
> 日期: 2025-12-22
> 状态: 待执行

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [项目现状评估](#2-项目现状评估)
3. [商业化目标](#3-商业化目标)
4. [改进路线图](#4-改进路线图)
5. [详细任务分解](#5-详细任务分解)
6. [资源需求](#6-资源需求)
7. [商业化策略](#7-商业化策略)
8. [风险管理](#8-风险管理)
9. [验收标准](#9-验收标准)
10. [附录](#10-附录)

---

## 1. 执行摘要

### 1.1 项目概述

本项目是一个基于 Node.js 的专业量化交易系统，支持多交易所（Binance/OKX/Bybit）、多策略（7种预置策略）、企业级风控（8大风控模块），具备完整的回测和实盘交易能力。

### 1.2 当前状态

| 维度 | 评分 | 就绪度 |
|------|------|--------|
| 整体架构 | 8.5/10 | 85% |
| 核心交易引擎 | 7.4/10 | 60% |
| 数据管理层 | 5.5/10 | 25% |
| 安全性 | 7.7/10 | 70% |
| 测试覆盖 | 6.1/10 | 55% |
| 交易所集成 | 9.0/10 | 90% |
| 部署运维 | 7.0/10 | 70% |
| **综合** | **7.3/10** | **65%** |

### 1.3 商业化结论

**可商业化，需 8-12 周改进周期**

- 目标就绪度: 90%+
- 预计投入: 2-3 名开发人员
- 商业模式: SaaS 订阅 + 私有化部署

---

## 2. 项目现状评估

### 2.1 核心优势

#### 技术优势
- **多交易所统一架构**: CCXT 统一抽象，支持 49+ 交易所扩展
- **企业级风控系统**: 8 大模块（仓位/日亏损/黑天鹅/熔断器/流动性等）
- **智能订单执行**: 500ms 自动重下、故障转移、并发安全
- **完整策略框架**: 7 种预置策略 + 标准化接口
- **专业日志监控**: Winston + Prometheus + Telegram/邮件告警

#### 代码统计
```
源代码文件: 77 个
源代码行数: ~11,000 行
测试文件: 46 个
测试用例: ~3,983 个
测试覆盖率: 61.89%
```

### 2.2 关键缺陷清单

#### P0 - 阻断性问题（必须修复）

| ID | 问题 | 影响 | 所在位置 |
|----|------|------|---------|
| P0-001 | .env 包含真实 API 密钥 | 安全风险极高 | `.env` |
| P0-002 | sql.js 不支持并发写入 | 数据损坏风险 | `src/database/DatabaseManager.js` |
| P0-003 | 30秒自动保存间隔 | 数据丢失风险 | `src/database/DatabaseManager.js` |
| P0-004 | 订单无持久化机制 | 重启丢失订单 | `src/executor/orderExecutor.js` |
| P0-005 | 行情引擎 0% 测试覆盖 | 可靠性未验证 | `src/marketdata/` |

#### P1 - 重要问题（上线前解决）

| ID | 问题 | 影响 | 所在位置 |
|----|------|------|---------|
| P1-001 | 无 Docker 容器化 | 部署不一致 | 项目根目录 |
| P1-002 | Redis 无持久化配置 | 重启丢失数据 | 配置文件 |
| P1-003 | 缺少 E2E 测试 | 流程未验证 | `tests/` |
| P1-004 | 告警通道 token 泄露 | 安全风险 | `.env` |
| P1-005 | 回测统计计算错误 | 策略评估不准 | `src/backtest/BacktestEngine.js` |
| P1-006 | Logger 模块 9% 覆盖 | 告警不可靠 | `src/logger/` |

#### P2 - 一般问题（可后续优化）

| ID | 问题 | 影响 | 所在位置 |
|----|------|------|---------|
| P2-001 | 无数据库分区策略 | 查询慢 | `src/database/` |
| P2-002 | 备份无增量机制 | 空间浪费 | `src/database/BackupManager.js` |
| P2-003 | 无压力测试 | 性能边界未知 | `tests/` |
| P2-004 | 策略测试覆盖 40% | 策略可靠性 | `src/strategies/` |
| P2-005 | 无 Web 管理界面 | 用户体验差 | - |

---

## 3. 商业化目标

### 3.1 产品目标

| 目标 | 指标 | 验收标准 |
|------|------|---------|
| 系统稳定性 | 99.9% 可用性 | 7x24小时运行无崩溃 |
| 数据安全 | 0 数据丢失 | 交易数据实时持久化 |
| 测试覆盖 | >80% 覆盖率 | 核心模块 >90% |
| 部署效率 | <10 分钟部署 | Docker 一键启动 |
| 用户体验 | NPS > 50 | Web 管理界面 |

### 3.2 目标用户

| 用户群体 | 需求特征 | 优先级 |
|---------|---------|--------|
| 个人量化交易者 | 开箱即用、低成本 | P0 |
| 小型交易团队 (3-5人) | 多用户、协作 | P1 |
| 量化培训机构 | 教学演示、定制 | P2 |
| 中型量化公司 | 高性能、定制开发 | P3 |

### 3.3 商业模式

| 模式 | 定价 | 目标客户 |
|------|------|---------|
| **基础版 SaaS** | $99/月 | 个人交易者 |
| **专业版 SaaS** | $299/月 | 小型团队 |
| **企业版 SaaS** | $499/月 | 中型公司 |
| **私有化部署** | $5,000-20,000 | 机构客户 |
| **定制开发** | $150/小时 | 特殊需求 |

---

## 4. 改进路线图

### 4.1 总体时间线

```
Week 1-2    Week 3-4    Week 5-6    Week 7-8    Week 9-10   Week 11-12
    |           |           |           |           |           |
    v           v           v           v           v           v
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Phase1 │ │ Phase2 │ │ Phase3 │ │ Phase4 │ │ Phase5 │ │ Phase6 │
│ 安全   │ │ 数据层 │ │ 测试   │ │ 部署   │ │ 功能   │ │ 商业化 │
│ 加固   │ │ 重构   │ │ 补全   │ │ 优化   │ │ 增强   │ │ 准备   │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
     |           |           |           |           |           |
  必须完成    必须完成    必须完成    必须完成     可选       必须
```

### 4.2 阶段概览

| 阶段 | 名称 | 周期 | 优先级 | 目标 |
|------|------|------|--------|------|
| Phase 1 | 安全加固 | Week 1-2 | P0 | 消除安全漏洞 |
| Phase 2 | 数据层重构 | Week 3-4 | P0 | 数据可靠性 |
| Phase 3 | 测试补全 | Week 5-6 | P0 | 质量保证 |
| Phase 4 | 部署优化 | Week 7-8 | P1 | 自动化部署 |
| Phase 5 | 功能增强 | Week 9-10 | P2 | 用户体验 |
| Phase 6 | 商业化准备 | Week 11-12 | P0 | 上市准备 |

---

## 5. 详细任务分解

### Phase 1: 安全加固（Week 1-2）

#### 5.1.1 API 密钥安全

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| SEC-001 | 移除 .env 中的真实 API 密钥 | - | 1h | 待开始 |
| SEC-002 | 更新 .gitignore 排除敏感文件 | - | 0.5h | 待开始 |
| SEC-003 | 实现密钥加密存储方案 | - | 4h | 待开始 |
| SEC-004 | 编写密钥管理文档 | - | 2h | 待开始 |
| SEC-005 | 实现密钥轮换机制 | - | 8h | 待开始 |

**验收标准:**
- [ ] 代码仓库中无任何明文密钥
- [ ] 密钥使用 AES-256-GCM 加密存储
- [ ] 支持通过环境变量注入主密码

#### 5.1.2 敏感信息保护

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| SEC-006 | 日志敏感字段脱敏 | - | 4h | 待开始 |
| SEC-007 | 强化 Dashboard 认证 | - | 4h | 待开始 |
| SEC-008 | 移除告警通道明文 token | - | 2h | 待开始 |
| SEC-009 | 实现 API 请求签名验证 | - | 8h | 待开始 |
| SEC-010 | 安全审计和渗透测试 | - | 16h | 待开始 |

**验收标准:**
- [ ] 日志中无 apiKey/secret/password 等敏感信息
- [ ] Dashboard 使用强密码 + 2FA
- [ ] 通过基础安全审计

---

### Phase 2: 数据层优化（Week 3-4）

> **架构简化**: 仅使用 Redis + ClickHouse 双数据库架构
> - **Redis**: 热数据（订单、持仓、配置、状态）- 支持实时更新
> - **ClickHouse**: 冷数据（历史K线、交易记录、审计日志）- 已实现
> - **移除 SQLite**: 业务数据迁移到 Redis

#### 5.2.1 SQLite 数据迁移到 Redis

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DB-001 | 设计 Redis 数据结构（Hash/Sorted Set） | - | 4h | 待开始 |
| DB-002 | 实现订单数据 Redis 存储层 | - | 6h | 待开始 |
| DB-003 | 实现持仓数据 Redis 存储层 | - | 4h | 待开始 |
| DB-004 | 实现策略状态 Redis 存储层 | - | 3h | 待开始 |
| DB-005 | 实现系统配置 Redis 存储层 | - | 2h | 待开始 |
| DB-006 | 重构 DatabaseManager 适配 Redis | - | 6h | 待开始 |
| DB-007 | 更新单元测试适配新存储层 | - | 4h | 待开始 |

**Redis 数据结构设计:**

```javascript
// 订单数据 - 使用 Hash
// Key: order:{orderId}
// 支持单字段更新，适合订单状态变更
HSET order:12345 status "filled" filled "1.5" updatedAt "1703232000000"

// 活跃订单索引 - 使用 Sorted Set
// Key: orders:active:{exchange}:{symbol}
// Score: 创建时间戳，便于按时间范围查询
ZADD orders:active:binance:BTC/USDT 1703232000000 "order:12345"

// 持仓数据 - 使用 Hash
// Key: position:{exchange}:{symbol}
HSET position:binance:BTC/USDT side "long" amount "0.5" entryPrice "42000"

// 策略状态 - 使用 Hash
// Key: strategy:{strategyId}
HSET strategy:sma_btc state "running" lastSignal "buy" lastSignalTime "1703232000000"

// 系统配置 - 使用 Hash
// Key: config:system
HSET config:system riskLimit "0.02" maxPositions "5"
```

**验收标准:**
- [ ] 订单 CRUD 操作全部迁移到 Redis
- [ ] 持仓数据实时更新正常
- [ ] 策略状态持久化正常
- [ ] 移除 SQLite 依赖（sql.js、better-sqlite3）

#### 5.2.2 历史数据归档到 ClickHouse

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DB-008 | 设计 ClickHouse 交易记录表 | - | 2h | 待开始 |
| DB-009 | 实现已完成订单归档任务 | - | 4h | 待开始 |
| DB-010 | 实现交易记录写入 ClickHouse | - | 3h | 待开始 |
| DB-011 | 实现审计日志写入 ClickHouse | - | 3h | 待开始 |
| DB-012 | 定时归档任务（Redis → ClickHouse） | - | 4h | 待开始 |

**ClickHouse 新增表结构:**

```sql
-- 交易记录表（追加写入）
CREATE TABLE IF NOT EXISTS trades
(
  trade_id String,
  order_id String,
  exchange LowCardinality(String),
  symbol LowCardinality(String),
  side LowCardinality(String),
  type LowCardinality(String),
  price Float64,
  amount Float64,
  cost Float64,
  fee Float64,
  fee_currency String,
  realized_pnl Float64,
  strategy String,
  timestamp DateTime64(3),
  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (exchange, symbol, timestamp)

-- 历史订单表（归档用）
CREATE TABLE IF NOT EXISTS orders_history
(
  order_id String,
  exchange LowCardinality(String),
  symbol LowCardinality(String),
  side LowCardinality(String),
  type LowCardinality(String),
  status LowCardinality(String),
  price Float64,
  amount Float64,
  filled Float64,
  cost Float64,
  fee Float64,
  strategy String,
  created_at DateTime64(3),
  closed_at DateTime64(3),
  archived_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (exchange, symbol, created_at)

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs
(
  log_id String,
  event_type LowCardinality(String),
  level LowCardinality(String),
  message String,
  data String,  -- JSON
  timestamp DateTime64(3),
  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (event_type, timestamp)
```

**验收标准:**
- [ ] 交易记录实时写入 ClickHouse
- [ ] 已完成订单定期归档（每小时）
- [ ] 审计日志写入正常
- [ ] 历史数据查询性能满足需求

#### 5.2.3 Redis 持久化配置

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DB-013 | 配置 Redis AOF 持久化 | - | 2h | 待开始 |
| DB-014 | 配置 Redis RDB 定期快照 | - | 1h | 待开始 |
| DB-015 | 实现 Redis 数据恢复机制 | - | 3h | 待开始 |
| DB-016 | Redis 数据备份策略 | - | 2h | 待开始 |

**订单状态机:**

```
                    ┌─────────┐
                    │ CREATED │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              v          v          v
        ┌─────────┐ ┌─────────┐ ┌─────────┐
        │ PENDING │ │ REJECTED│ │ EXPIRED │
        └────┬────┘ └─────────┘ └─────────┘
             │
    ┌────────┼────────┐
    │        │        │
    v        v        v
┌───────┐ ┌───────┐ ┌────────┐
│PARTIAL│ │ FILLED│ │CANCELED│
└───┬───┘ └───────┘ └────────┘
    │
    v
┌───────┐
│ FILLED│
└───────┘
```

**验收标准:**
- [ ] 订单创建后立即持久化
- [ ] 系统重启后可恢复未完成订单
- [ ] 防止重复订单提交（idempotency key）

#### 5.2.3 Redis 配置优化（已有 ioredis）

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DB-011 | 配置 Redis AOF 持久化 | - | 2h | 待开始 |
| DB-012 | 优化 Redis 连接池配置 | - | 2h | 待开始 |
| DB-013 | 配置 Redis Sentinel（可选高可用） | - | 4h | 待开始 |
| DB-014 | Redis 数据备份策略 | - | 2h | 待开始 |

**Redis 配置模板:**

```conf
# redis.conf 生产配置
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

maxmemory 1gb
maxmemory-policy allkeys-lru

# 安全配置
requirepass ${REDIS_PASSWORD}
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

**验收标准:**
- [ ] Redis 启用 AOF 持久化
- [ ] 配置合理的内存上限和淘汰策略
- [ ] Redis 重启后数据不丢失

---

### Phase 3: 测试补全（Week 5-6）

#### 5.3.1 单元测试补全

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| TEST-001 | MarketDataEngine 单元测试 | - | 16h | 待开始 |
| TEST-002 | Logger 模块单元测试 | - | 8h | 待开始 |
| TEST-003 | OrderExecutor 测试增强 | - | 12h | 待开始 |
| TEST-004 | Strategy 模块测试增强 | - | 12h | 待开始 |
| TEST-005 | BacktestEngine 测试修复 | - | 8h | 待开始 |

**测试覆盖率目标:**

| 模块 | 当前 | 目标 | 差距 |
|------|------|------|------|
| marketdata | 0% | 80% | +80% |
| logger | 9% | 75% | +66% |
| executor | 55% | 85% | +30% |
| strategies | 41% | 80% | +39% |
| **整体** | 62% | 80% | +18% |

#### 5.3.2 集成测试

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| TEST-006 | 交易流程集成测试 | - | 16h | 待开始 |
| TEST-007 | 多交易所切换测试 | - | 8h | 待开始 |
| TEST-008 | 风控触发集成测试 | - | 8h | 待开始 |
| TEST-009 | 数据持久化集成测试 | - | 8h | 待开始 |

#### 5.3.3 E2E 测试

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| TEST-010 | E2E 测试框架搭建 | - | 8h | 待开始 |
| TEST-011 | 完整交易周期 E2E | - | 16h | 待开始 |
| TEST-012 | 故障恢复 E2E | - | 8h | 待开始 |
| TEST-013 | 多策略并行 E2E | - | 8h | 待开始 |

**E2E 测试场景清单:**

```javascript
// tests/e2e/scenarios.js
const E2E_SCENARIOS = [
  {
    name: '完整交易周期',
    steps: [
      '1. 系统启动和初始化',
      '2. 连接交易所（测试网）',
      '3. 订阅行情数据',
      '4. 策略生成买入信号',
      '5. 风控审批通过',
      '6. 订单执行成功',
      '7. 仓位更新正确',
      '8. 盈亏计算正确',
      '9. 系统优雅关闭',
    ],
    expectedDuration: '5min',
  },
  {
    name: '网络中断恢复',
    steps: [
      '1. 正常运行状态',
      '2. 模拟网络中断',
      '3. 系统检测到断线',
      '4. 触发自动重连',
      '5. 状态同步验证',
      '6. 恢复正常交易',
    ],
    expectedDuration: '3min',
  },
  // 更多场景...
];
```

**验收标准:**
- [ ] 单元测试覆盖率 >= 80%
- [ ] 所有集成测试通过
- [ ] E2E 测试 100% 通过
- [ ] CI 流水线完整运行

---

### Phase 4: 部署优化（Week 7-8）

#### 5.4.1 Docker 容器化

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DEPLOY-001 | 编写 Dockerfile | - | 4h | 待开始 |
| DEPLOY-002 | 编写 docker-compose.yml | - | 4h | 待开始 |
| DEPLOY-003 | 多阶段构建优化 | - | 4h | 待开始 |
| DEPLOY-004 | 镜像安全扫描配置 | - | 2h | 待开始 |
| DEPLOY-005 | 编写部署文档 | - | 4h | 待开始 |

**Dockerfile 模板:**

```dockerfile
# Dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# 安全：使用非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 quant

# 复制必要文件
COPY --from=builder --chown=quant:nodejs /app/dist ./dist
COPY --from=builder --chown=quant:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quant:nodejs /app/package.json ./

USER quant

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

**docker-compose.yml 模板:**

```yaml
# docker-compose.yml
version: '3.8'

services:
  quant-engine:
    build: .
    container_name: quant-trading-engine
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
      - "9090:9090"  # Prometheus metrics
    volumes:
      - ./logs:/app/logs
      - ./config:/app/config
    depends_on:
      - clickhouse
      - redis
    networks:
      - quant-network
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - CLICKHOUSE_HOST=clickhouse
      - CLICKHOUSE_PORT=8123

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: quant-clickhouse
    restart: unless-stopped
    environment:
      CLICKHOUSE_DB: ${CLICKHOUSE_DATABASE:-quant}
      CLICKHOUSE_USER: ${CLICKHOUSE_USERNAME:-default}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-}
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - clickhouse-logs:/var/log/clickhouse-server
    ports:
      - "8123:8123"   # HTTP 接口
      - "9000:9000"   # Native 接口
    networks:
      - quant-network
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  redis:
    image: redis:7-alpine
    container_name: quant-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    networks:
      - quant-network

  prometheus:
    image: prom/prometheus:latest
    container_name: quant-prometheus
    restart: unless-stopped
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9091:9090"
    networks:
      - quant-network

  grafana:
    image: grafana/grafana:latest
    container_name: quant-grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
    networks:
      - quant-network

volumes:
  clickhouse-data:
  clickhouse-logs:
  redis-data:
  prometheus-data:
  grafana-data:

networks:
  quant-network:
    driver: bridge
```

#### 5.4.2 CI/CD 流水线

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DEPLOY-006 | GitHub Actions CI 配置 | - | 4h | 待开始 |
| DEPLOY-007 | 自动化测试流水线 | - | 4h | 待开始 |
| DEPLOY-008 | Docker 镜像自动构建 | - | 4h | 待开始 |
| DEPLOY-009 | 自动化部署脚本 | - | 8h | 待开始 |
| DEPLOY-010 | 蓝绿部署策略 | - | 8h | 待开始 |

**GitHub Actions 配置:**

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v3

  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        run: |
          # 部署脚本
          echo "Deploying to production..."
```

**验收标准:**
- [ ] Docker 一键启动成功
- [ ] CI 流水线自动运行
- [ ] 测试覆盖率检查通过
- [ ] 镜像自动构建和推送

#### 5.4.3 监控告警

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DEPLOY-011 | Prometheus 指标配置 | - | 4h | 待开始 |
| DEPLOY-012 | Grafana Dashboard 设计 | - | 8h | 待开始 |
| DEPLOY-013 | 告警规则配置 | - | 4h | 待开始 |
| DEPLOY-014 | 日志聚合（ELK/Loki） | - | 8h | 待开始 |

---

### Phase 5: 功能增强（Week 9-10）

#### 5.5.1 Web 管理界面

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| FEAT-001 | 技术选型（Vue/React） | - | 2h | 待开始 |
| FEAT-002 | 仪表板首页 | - | 16h | 待开始 |
| FEAT-003 | 策略管理页面 | - | 12h | 待开始 |
| FEAT-004 | 交易记录页面 | - | 8h | 待开始 |
| FEAT-005 | 风控配置页面 | - | 8h | 待开始 |
| FEAT-006 | 系统设置页面 | - | 8h | 待开始 |

#### 5.5.2 API 网关

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| FEAT-007 | RESTful API 设计 | - | 8h | 待开始 |
| FEAT-008 | API 认证授权 | - | 8h | 待开始 |
| FEAT-009 | API 限流配置 | - | 4h | 待开始 |
| FEAT-010 | API 文档（Swagger） | - | 4h | 待开始 |

#### 5.5.3 策略优化器

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| FEAT-011 | 参数网格搜索 | - | 12h | 待开始 |
| FEAT-012 | Walk-Forward 分析 | - | 16h | 待开始 |
| FEAT-013 | 蒙特卡洛模拟 | - | 12h | 待开始 |

---

### Phase 6: 商业化准备（Week 11-12）

#### 5.6.1 文档完善

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| DOC-001 | 用户使用手册 | - | 16h | 待开始 |
| DOC-002 | API 参考文档 | - | 8h | 待开始 |
| DOC-003 | 部署运维手册 | - | 8h | 待开始 |
| DOC-004 | 故障排查指南 | - | 8h | 待开始 |
| DOC-005 | 策略开发指南 | - | 8h | 待开始 |

#### 5.6.2 许可证和合规

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| LEGAL-001 | 选择开源许可证 | - | 2h | 待开始 |
| LEGAL-002 | 用户协议起草 | - | 8h | 待开始 |
| LEGAL-003 | 隐私政策起草 | - | 8h | 待开始 |
| LEGAL-004 | 风险免责声明 | - | 4h | 待开始 |

#### 5.6.3 销售准备

| Task ID | 任务 | 负责人 | 预计工时 | 状态 |
|---------|------|--------|---------|------|
| SALES-001 | 产品官网设计 | - | 24h | 待开始 |
| SALES-002 | 定价策略制定 | - | 8h | 待开始 |
| SALES-003 | 演示环境搭建 | - | 8h | 待开始 |
| SALES-004 | 销售材料准备 | - | 16h | 待开始 |
| SALES-005 | 客户支持流程 | - | 8h | 待开始 |

---

## 6. 资源需求

### 6.1 人力资源

| 角色 | 人数 | 职责 | 参与阶段 |
|------|------|------|---------|
| 后端开发 | 2 | 核心功能开发、数据库重构 | Phase 1-4 |
| 前端开发 | 1 | Web 管理界面开发 | Phase 5 |
| DevOps | 1 | CI/CD、Docker、监控 | Phase 4 |
| QA | 1 | 测试、质量保证 | Phase 3 |
| 产品经理 | 0.5 | 需求管理、文档 | 全程 |

### 6.2 工时估算

| 阶段 | 工时 | 人天 | 说明 |
|------|------|------|------|
| Phase 1 | 48h | 6 | 安全加固 |
| Phase 2 | 45h | 5.5 | 数据层重构（SQLite → Redis + ClickHouse 归档） |
| Phase 3 | 96h | 12 | 测试补全 |
| Phase 4 | 64h | 8 | 部署优化 |
| Phase 5 | 120h | 15 | 功能增强 |
| Phase 6 | 80h | 10 | 商业化准备 |
| **合计** | **453h** | **56.5** | 约 11-12 周 |

> **注意**: 相比原 PostgreSQL 方案节省约 35h，因为：
> - 无需 PostgreSQL 迁移（节省 ~48h）
> - 增加 SQLite → Redis 迁移（+45h）
> - 简化为 Redis + ClickHouse 双数据库架构，运维复杂度降低

### 6.3 基础设施成本（月度）

| 资源 | 规格 | 提供商 | 费用/月 |
|------|------|--------|--------|
| 云服务器 | 4C8G | AWS/阿里云 | $80-120 |
| ClickHouse | 自建/2C4G | Docker 容器 | $0-40 |
| Redis | 托管版/自建 | ElastiCache/Docker | $0-50 |
| 对象存储 | 100GB | S3/OSS | $5-10 |
| CDN | 100GB | CloudFront | $10-20 |
| 域名 + SSL | - | - | $15 |
| 监控服务 | Grafana Cloud | - | $0-50 |
| **合计** | - | - | **$110-305** |

> **注意**: 使用 Redis + ClickHouse 双数据库架构，无需额外的数据库服务器成本

---

## 7. 商业化策略

### 7.1 产品线规划

```
┌─────────────────────────────────────────────────────────────┐
│                     产品线架构                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   基础版    │  │   专业版    │  │   企业版    │        │
│  │  $99/月     │  │  $299/月    │  │  $499/月    │        │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤        │
│  │ 1 交易所    │  │ 3 交易所    │  │ 无限交易所  │        │
│  │ 3 策略     │  │ 无限策略    │  │ 无限策略    │        │
│  │ 基础风控    │  │ 高级风控    │  │ 企业风控    │        │
│  │ 邮件告警    │  │ 多渠道告警  │  │ 自定义告警  │        │
│  │ 社区支持    │  │ 工单支持    │  │ 专属支持    │        │
│  │ -          │  │ API 访问    │  │ 源码访问    │        │
│  │ -          │  │ -          │  │ 私有部署    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                    私有化部署                        │  │
│  │                 $5,000 - $20,000                    │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │ 完整源码 | 定制开发 | 现场部署 | 培训支持           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 功能对比矩阵

| 功能 | 基础版 | 专业版 | 企业版 |
|------|--------|--------|--------|
| 交易所数量 | 1 | 3 | 无限 |
| 策略数量 | 3 | 无限 | 无限 |
| 回测历史 | 30天 | 1年 | 无限 |
| 实时策略 | 1 | 5 | 无限 |
| 风控模块 | 基础 | 高级 | 全部 |
| API 调用 | - | 10k/天 | 无限 |
| 数据导出 | CSV | CSV/JSON | 全格式 |
| 多用户 | - | 3 | 无限 |
| 自定义策略 | - | ✓ | ✓ |
| 白标定制 | - | - | ✓ |
| SLA | 99% | 99.5% | 99.9% |
| 支持响应 | 48h | 24h | 4h |

### 7.3 定价策略

| 定价模式 | 适用场景 | 优势 | 劣势 |
|---------|---------|------|------|
| 订阅制 | SaaS | 稳定现金流 | 需持续维护 |
| 一次性 | 私有部署 | 高客单价 | 收入不稳定 |
| 交易量分成 | 大客户 | 利益绑定 | 收入波动 |
| 免费+增值 | 获客 | 用户基数大 | 转化率低 |

**推荐策略: 订阅制 + 私有部署**

### 7.4 获客策略

| 渠道 | 方式 | 预算/月 | 预期效果 |
|------|------|--------|---------|
| SEO | 技术博客、文档 | $0 | 长期获客 |
| 社区 | GitHub、Discord | $0 | 口碑传播 |
| 内容营销 | 策略分享、教程 | $500 | 建立信任 |
| 付费广告 | Google/Twitter | $1000 | 快速获客 |
| KOL 合作 | 量化大V | $500 | 精准触达 |
| 合作伙伴 | 交易所、数据商 | $0 | 资源互换 |

---

## 8. 风险管理

### 8.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 数据库迁移失败 | 中 | 高 | 充分测试、回滚方案 |
| 交易所 API 变更 | 中 | 中 | 保持 CCXT 更新、抽象层 |
| 性能瓶颈 | 低 | 中 | 压力测试、架构优化 |
| 安全漏洞 | 低 | 高 | 安全审计、渗透测试 |

### 8.2 业务风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 监管政策变化 | 中 | 高 | 法律咨询、合规设计 |
| 市场竞争加剧 | 高 | 中 | 差异化、快速迭代 |
| 客户流失 | 中 | 中 | 提升体验、客户成功 |
| 资金风险（客户） | 中 | 高 | 免责声明、风险提示 |

### 8.3 运营风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 服务中断 | 低 | 高 | 高可用架构、容灾 |
| 数据丢失 | 低 | 高 | 多重备份、异地容灾 |
| 团队变动 | 中 | 中 | 文档完善、知识转移 |

### 8.4 风险应对预算

| 风险类型 | 预留预算 | 用途 |
|---------|---------|------|
| 技术风险 | $5,000 | 紧急修复、专家咨询 |
| 法律风险 | $3,000 | 法律咨询、合规审计 |
| 运营风险 | $2,000 | 应急响应、备用资源 |
| **合计** | **$10,000** | - |

---

## 9. 验收标准

### 9.1 Phase 1 验收（安全加固）

- [ ] 代码仓库扫描无敏感信息
- [ ] 密钥加密存储功能可用
- [ ] 通过 OWASP Top 10 基础检查
- [ ] 日志无敏感信息泄露

### 9.2 Phase 2 验收（数据层重构）

- [ ] 订单数据 Redis 存储层实现完成
- [ ] 持仓数据 Redis 存储层实现完成
- [ ] 策略状态 Redis 存储层实现完成
- [ ] Redis AOF 持久化配置完成
- [ ] 已完成订单归档到 ClickHouse 正常
- [ ] 交易记录写入 ClickHouse 正常
- [ ] 移除 SQLite 依赖（sql.js、better-sqlite3）
- [ ] 系统重启后 Redis 数据恢复正常
- [ ] 数据一致性测试通过

### 9.3 Phase 3 验收（测试补全）

- [ ] 单元测试覆盖率 >= 80%
- [ ] 核心模块覆盖率 >= 90%
- [ ] E2E 测试 100% 通过
- [ ] 性能基准测试完成

### 9.4 Phase 4 验收（部署优化）

- [ ] Docker 一键部署成功
- [ ] CI/CD 流水线正常运行
- [ ] Grafana 监控面板可用
- [ ] 告警规则生效

### 9.5 Phase 5 验收（功能增强）

- [ ] Web 管理界面功能完整
- [ ] API 文档完整
- [ ] 策略优化器可用

### 9.6 Phase 6 验收（商业化准备）

- [ ] 用户文档完整
- [ ] 法律文件准备就绪
- [ ] 演示环境可用
- [ ] 定价体系确定

### 9.7 最终上线验收

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 系统稳定性 | 连续运行 7 天无崩溃 | - |
| 数据完整性 | 零数据丢失 | - |
| 安全审计 | 通过第三方审计 | - |
| 性能指标 | 订单延迟 < 100ms | - |
| 用户测试 | Beta 用户反馈良好 | - |

---

## 10. 附录

### 10.1 数据存储架构说明

```
┌─────────────────────────────────────────────────────────────────┐
│               数据存储架构 (Redis + ClickHouse)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────┐  ┌─────────────────────────┐  │
│  │          Redis              │  │       ClickHouse        │  │
│  │        (ioredis)            │  │    (@clickhouse/client) │  │
│  ├─────────────────────────────┤  ├─────────────────────────┤  │
│  │       热数据层 (实时)        │  │     冷数据层 (历史)      │  │
│  │ • 活跃订单 (Hash)           │  │ • K线数据              │  │
│  │ • 持仓数据 (Hash)           │  │ • 资金费率              │  │
│  │ • 策略状态 (Hash)           │  │ • 持仓量                │  │
│  │ • 系统配置 (Hash)           │  │ • 标记价格              │  │
│  │ • 订单索引 (Sorted Set)     │  │ • 历史订单 (归档)       │  │
│  │ • 限流计数 (String)         │  │ • 交易记录              │  │
│  │ • 会话缓存                  │  │ • 审计日志              │  │
│  └─────────────────────────────┘  └─────────────────────────┘  │
│             ↓                              ↓                    │
│      毫秒级读写                      列式分析查询               │
│      AOF 持久化                     时序数据优化               │
│      支持实时更新                    追加写入模式               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    数据归档流程                           │  │
│  │   Redis (活跃订单) ──定时任务──> ClickHouse (历史订单)     │  │
│  │   订单完成后 ──实时写入──> ClickHouse (交易记录)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Redis 数据结构 (新增):**

```javascript
// 订单数据 - 使用 Hash
// Key: order:{orderId}
HSET order:12345 status "filled" filled "1.5" updatedAt "1703232000000"

// 活跃订单索引 - 使用 Sorted Set
// Key: orders:active:{exchange}:{symbol}
ZADD orders:active:binance:BTC/USDT 1703232000000 "order:12345"

// 持仓数据 - 使用 Hash
// Key: position:{exchange}:{symbol}
HSET position:binance:BTC/USDT side "long" amount "0.5" entryPrice "42000"

// 策略状态 - 使用 Hash
// Key: strategy:{strategyId}
HSET strategy:sma_btc state "running" lastSignal "buy"

// 系统配置 - 使用 Hash
// Key: config:system
HSET config:system riskLimit "0.02" maxPositions "5"
```

**ClickHouse 表结构（已有 + 新增）:**

已有表（见 scripts/download-history.js）：
- `ohlcv_{exchange}` - K线数据表（按交易所分表）
- `funding_rate_{exchange}` - 资金费率表
- `open_interest_{exchange}` - 持仓量表
- `mark_price_{exchange}` - 标记价格表

新增表（用于业务数据归档）：
- `trades` - 交易记录表
- `orders_history` - 历史订单表（归档）
- `audit_logs` - 审计日志表

### 10.2 API 接口设计

```yaml
# OpenAPI 3.0 规范摘要
openapi: 3.0.0
info:
  title: Quant Trading System API
  version: 1.0.0

paths:
  /api/v1/auth/login:
    post:
      summary: 用户登录
      tags: [认证]

  /api/v1/strategies:
    get:
      summary: 获取策略列表
      tags: [策略]
    post:
      summary: 创建策略
      tags: [策略]

  /api/v1/strategies/{id}/start:
    post:
      summary: 启动策略
      tags: [策略]

  /api/v1/trades:
    get:
      summary: 获取交易记录
      tags: [交易]

  /api/v1/positions:
    get:
      summary: 获取持仓
      tags: [持仓]

  /api/v1/risk/config:
    get:
      summary: 获取风控配置
      tags: [风控]
    put:
      summary: 更新风控配置
      tags: [风控]

  /api/v1/backtest:
    post:
      summary: 执行回测
      tags: [回测]

  /api/v1/metrics:
    get:
      summary: 获取系统指标
      tags: [监控]
```

### 10.3 监控指标清单

```yaml
# Prometheus 指标
metrics:
  # 交易指标
  - name: quant_orders_total
    type: counter
    labels: [exchange, symbol, side, status]

  - name: quant_order_latency_seconds
    type: histogram
    labels: [exchange, symbol]
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10]

  - name: quant_trade_volume_total
    type: counter
    labels: [exchange, symbol]

  - name: quant_pnl_total
    type: gauge
    labels: [strategy, symbol]

  # 风控指标
  - name: quant_risk_events_total
    type: counter
    labels: [event_type, severity]

  - name: quant_position_exposure
    type: gauge
    labels: [exchange, symbol]

  - name: quant_drawdown_percent
    type: gauge
    labels: [strategy]

  # 系统指标
  - name: quant_websocket_connections
    type: gauge
    labels: [exchange]

  - name: quant_api_requests_total
    type: counter
    labels: [endpoint, status]

  - name: quant_database_connections
    type: gauge
```

### 10.4 告警规则配置

```yaml
# alerting_rules.yml
groups:
  - name: quant-trading-alerts
    rules:
      # 交易告警
      - alert: HighOrderLatency
        expr: histogram_quantile(0.95, quant_order_latency_seconds) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "订单延迟过高"

      - alert: OrderExecutionFailed
        expr: increase(quant_orders_total{status="failed"}[5m]) > 5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "订单执行失败频繁"

      # 风控告警
      - alert: RiskEventTriggered
        expr: increase(quant_risk_events_total{severity="critical"}[5m]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "风控事件触发"

      - alert: DrawdownExceeded
        expr: quant_drawdown_percent > 10
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "回撤超过阈值"

      # 系统告警
      - alert: WebSocketDisconnected
        expr: quant_websocket_connections == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "WebSocket 断线"

      - alert: DatabaseConnectionLow
        expr: quant_database_connections < 2
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "数据库连接不足"
```

### 10.5 项目结构（改进后）

```
new-quant-trading-system-js/
├── src/
│   ├── api/                    # API 网关（新增）
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── controllers/
│   ├── backtest/
│   ├── config/
│   ├── database/
│   │   ├── RedisManager.js     # Redis 数据存储层（新增）
│   │   ├── ClickHouseManager.js # ClickHouse 归档层（已有）
│   │   ├── repositories/       # 数据仓库模式（新增）
│   │   └── models/
│   ├── exchange/
│   ├── executor/
│   ├── lifecycle/
│   ├── logger/
│   ├── marketdata/
│   ├── monitoring/
│   ├── portfolio/
│   ├── risk/
│   ├── strategies/
│   ├── utils/
│   ├── web/                    # Web 界面（新增）
│   │   ├── components/
│   │   ├── pages/
│   │   └── assets/
│   ├── index.js
│   └── main.js
├── scripts/
│   ├── keyManager.js
│   ├── download-history.js     # ClickHouse 数据下载（已有）
│   ├── migrate-to-redis.js     # SQLite → Redis 迁移脚本（新增）
│   └── seed.js                 # 测试数据（新增）
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/                    # E2E 测试（新增）
│   └── benchmark/
├── config/
│   ├── default.js
│   ├── production.js
│   ├── redis.conf              # Redis 配置（新增）
│   └── prometheus.yml          # 监控配置（新增）
├── docker/                     # Docker 相关（新增）
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx.conf
├── docs/
│   ├── README.md
│   ├── COMMERCIALIZATION_PLAN.md
│   ├── API.md                  # API 文档（新增）
│   ├── DEPLOYMENT.md           # 部署文档（新增）
│   └── TROUBLESHOOTING.md      # 故障排查（新增）
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml              # CD 配置（新增）
├── package.json
├── pnpm-lock.yaml
├── ecosystem.config.cjs
├── vitest.config.js
└── .env.example
```

**数据存储分布:**
- `Redis` - Docker 容器/托管服务（订单、持仓、策略状态、配置）
- `ClickHouse` - Docker 容器/托管服务（历史行情、交易记录、审计日志）

---

## 更新日志

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 1.0.0 | 2025-12-22 | 初始版本 |
| 1.1.0 | 2025-12-22 | 移除 PostgreSQL 迁移方案，改为 Redis + ClickHouse + SQLite(better-sqlite3) 架构；减少工时估算 53h；更新 docker-compose.yml 添加 ClickHouse 容器 |
| 1.2.0 | 2025-12-22 | 简化为 Redis + ClickHouse 双数据库架构；移除 SQLite，业务数据迁移到 Redis；增加 ClickHouse 归档表设计；更新工时估算为 453h |

---

*本文档由项目团队维护，如有问题请联系项目负责人。*
