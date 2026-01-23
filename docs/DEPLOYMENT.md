# Quant Trading System - 部署指南

## 目录

- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [开发环境](#开发环境)
- [生产部署](#生产部署)
- [Docker 命令参考](#docker-命令参考)
- [配置说明](#配置说明)
- [监控与日志](#监控与日志)
- [安全配置](#安全配置)
- [故障排除](#故障排除)
- [备份与恢复](#备份与恢复)

---

## 系统要求

### 硬件要求

| 环境 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 开发 | 2 核 | 4 GB | 20 GB |
| 影子模式 | 2 核 | 4 GB | 50 GB |
| 实盘模式 | 4 核 | 8 GB | 100 GB |
| 高可用 | 8 核 | 16 GB | 200 GB |

### 软件要求

- **Docker**: 24.0+
- **Docker Compose**: 2.20+
- **操作系统**: Linux (推荐 Ubuntu 22.04 LTS) / Windows 10+ / macOS

### 端口占用

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | API Server | 主 API 接口 |
| 8080 | WebSocket | 实时数据推送 |
| 9091 | Prometheus | 指标暴露 |
| 6379 | Redis Master | 内存数据库 |
| 6380-6381 | Redis Replica | 只读副本 |
| 8123 | ClickHouse HTTP | 分析数据库 |
| 9000 | ClickHouse Native | 原生协议 |

---

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd new-quant-trading-system-js
```

### 2. 创建必要目录

```bash
# 创建数据和日志目录
mkdir -p data/redis-master data/redis-replica1 data/redis-replica2
mkdir -p data/clickhouse logs/clickhouse
mkdir -p backups/redis config/redis-sentinel
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置 (必须配置交易所 API 密钥)
nano .env
```

### 4. 启动服务 (影子模式)

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f quant-shadow
```

### 5. 验证部署

```bash
# 检查服务状态
docker compose ps

# 健康检查
curl http://localhost:3000/health

# 查看指标
curl http://localhost:9091/metrics
```

---

## 开发环境

### 启动开发模式

```bash
# 使用 dev profile 启动
docker compose --profile dev up -d quant-dev redis-master clickhouse

# 查看开发日志 (热重载)
docker compose logs -f quant-dev
```

### 本地开发 (不使用 Docker)

```bash
# 安装依赖
pnpm install

# 仅启动基础设施
docker compose up -d redis-master clickhouse

# 本地运行应用
pnpm dev
```

---

## 生产部署

### 影子模式部署 (推荐先行)

影子模式用于验证策略，不执行实际交易：

```bash
# 构建生产镜像
docker compose build quant-shadow

# 启动影子模式
docker compose up -d quant-shadow

# 验证运行
docker compose logs --tail=100 quant-shadow
```

### 实盘模式部署

> **警告**: 实盘模式会执行真实交易，请确保已充分测试！

```bash
# 启动实盘模式
docker compose --profile live up -d quant-live

# 监控日志
docker compose logs -f quant-live
```

### 高可用部署

高可用模式包含 Redis 主从复制和 Sentinel 哨兵：

```bash
# 启动高可用集群
docker compose --profile ha up -d

# 验证 Redis 集群状态
docker exec quant-redis-master redis-cli INFO replication
```

### 监控工具部署

```bash
# 启动 Grafana + Prometheus
docker compose --profile monitoring up -d

# 启动 Redis Commander
docker compose --profile tools up -d redis-commander
```

---

## Docker 命令参考

### 镜像管理

```bash
# 构建所有镜像
docker compose build

# 构建单个服务
docker compose build quant-shadow

# 构建不使用缓存
docker compose build --no-cache

# 拉取最新基础镜像
docker compose pull
```

### 服务管理

```bash
# 启动所有服务
docker compose up -d

# 启动指定服务
docker compose up -d quant-shadow redis-master clickhouse

# 停止所有服务
docker compose down

# 停止并删除数据卷 (危险!)
docker compose down -v

# 重启服务
docker compose restart quant-shadow

# 查看服务状态
docker compose ps

# 查看资源使用
docker stats
```

### 日志管理

```bash
# 查看所有日志
docker compose logs

# 跟踪日志
docker compose logs -f

# 查看最近 100 行
docker compose logs --tail=100 quant-shadow

# 按时间过滤
docker compose logs --since="2024-01-01T00:00:00"
```

### 容器调试

```bash
# 进入容器
docker exec -it quant-trading-shadow sh

# 查看环境变量
docker exec quant-trading-shadow env

# 查看进程
docker exec quant-trading-shadow ps aux

# 检查网络
docker exec quant-trading-shadow ping redis-master
```

---

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | production |
| `RUN_MODE` | 运行模式 (shadow/live) | shadow |
| `LOG_LEVEL` | 日志级别 | info |
| `REDIS_HOST` | Redis 主机 | redis-master |
| `REDIS_PORT` | Redis 端口 | 6379 |
| `CLICKHOUSE_HOST` | ClickHouse 主机 | clickhouse |
| `CLICKHOUSE_PORT` | ClickHouse 端口 | 8123 |

### 配置文件

```
config/
├── redis.conf           # Redis 配置
├── redis-sentinel/      # Sentinel 配置
│   ├── sentinel-1.conf
│   ├── sentinel-2.conf
│   └── sentinel-3.conf
├── clickhouse/          # ClickHouse 配置
├── grafana/             # Grafana 仪表盘
└── prometheus/          # Prometheus 配置
```

### Redis 配置示例

```conf
# config/redis.conf
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

---

## 监控与日志

### Prometheus 指标

访问 `http://localhost:9091/metrics` 查看以下指标：

- `trading_orders_total` - 订单总数
- `trading_pnl_total` - 盈亏统计
- `trading_position_value` - 持仓价值
- `api_request_duration_seconds` - API 响应时间

### Grafana 仪表盘

1. 访问 `http://localhost:3000`
2. 默认账号: admin / admin123
3. 导入预置仪表盘

### 日志文件

```
logs/
├── app/
│   ├── combined.log    # 所有日志
│   ├── error.log       # 错误日志
│   └── trading.log     # 交易日志
└── clickhouse/         # ClickHouse 日志
```

### 日志轮转

Docker 已配置自动日志轮转：
- 最大单文件: 100MB
- 最大文件数: 5

---

## 安全配置

### 容器安全

- 以非 root 用户运行 (UID 1001)
- 只读配置文件挂载
- 资源限制防止 DoS
- 健康检查自动重启

### 网络安全

```bash
# 查看网络配置
docker network inspect quant-network

# 限制外部访问 (仅本地)
# 在 docker-compose.yml 中修改端口绑定为 127.0.0.1:3000:3000
```

### 密钥管理

```bash
# 使用 Docker secrets (Swarm 模式)
docker secret create api_key ./secrets/api_key.txt

# 或使用环境变量加密
# 参见 docs/security/key-management.md
```

### 安全扫描

```bash
# 运行 Trivy 扫描
trivy image quant-trading-system:latest

# 扫描配置文件
trivy config .

# CI/CD 自动扫描
# 见 .github/workflows/security-scan.yml
```

---

## 故障排除

### 常见问题

#### 1. 容器无法启动

```bash
# 检查日志
docker compose logs quant-shadow

# 常见原因:
# - 端口冲突: lsof -i :3000
# - 内存不足: docker stats
# - 配置错误: 检查 .env 文件
```

#### 2. Redis 连接失败

```bash
# 检查 Redis 状态
docker exec quant-redis-master redis-cli ping

# 检查网络连通性
docker exec quant-trading-shadow ping redis-master

# 查看 Redis 日志
docker compose logs redis-master
```

#### 3. ClickHouse 连接失败

```bash
# 检查 ClickHouse 状态
docker exec quant-clickhouse clickhouse-client --query "SELECT 1"

# 查看健康状态
curl http://localhost:8123/ping
```

#### 4. 健康检查失败

```bash
# 手动检查健康端点
curl -v http://localhost:3000/health

# 检查应用日志
docker compose logs --tail=50 quant-shadow
```

#### 5. 磁盘空间不足

```bash
# 清理未使用的镜像和容器
docker system prune -a

# 清理日志
truncate -s 0 logs/app/*.log

# 查看磁盘使用
docker system df
```

### 性能问题

```bash
# 查看资源使用
docker stats

# 检查慢查询 (ClickHouse)
docker exec quant-clickhouse \
  clickhouse-client --query "SELECT * FROM system.query_log WHERE query_duration_ms > 1000"

# Redis 慢日志
docker exec quant-redis-master redis-cli SLOWLOG GET 10
```

---

## 备份与恢复

### Redis 备份

```bash
# 触发 RDB 快照
docker exec quant-redis-master redis-cli BGSAVE

# 备份 RDB 文件
docker cp quant-redis-master:/data/dump.rdb ./backups/redis/

# 定时备份脚本
scripts/backup-redis.sh
```

### ClickHouse 备份

```bash
# 备份表
docker exec quant-clickhouse \
  clickhouse-client --query "BACKUP TABLE quant_trading.trades TO '/backups/trades.zip'"

# 恢复
docker exec quant-clickhouse \
  clickhouse-client --query "RESTORE TABLE quant_trading.trades FROM '/backups/trades.zip'"
```

### 完整备份

```bash
# 停止服务
docker compose stop

# 备份所有数据
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/ config/

# 恢复
tar -xzf backup-20240101.tar.gz

# 重启服务
docker compose up -d
```

---

## 升级指南

### 升级应用

```bash
# 拉取最新代码
git pull origin main

# 重新构建镜像
docker compose build --no-cache

# 滚动更新 (零停机)
docker compose up -d --no-deps quant-shadow
```

### 升级基础设施

```bash
# 更新 Docker 镜像
docker compose pull

# 重启服务
docker compose up -d
```

---

## 附录

### 目录结构

```
.
├── Dockerfile              # 多阶段构建
├── docker-compose.yml      # 服务编排
├── .dockerignore           # 构建排除
├── .trivy.yaml             # 安全扫描配置
├── config/                 # 配置文件
├── data/                   # 持久化数据
├── logs/                   # 日志文件
├── backups/                # 备份文件
└── scripts/                # 运维脚本
```

### Docker Compose Profiles

| Profile | 服务 | 用途 |
|---------|------|------|
| (默认) | quant-shadow, redis-master, clickhouse | 影子模式 |
| `dev` | quant-dev | 开发环境 |
| `live` | quant-live | 实盘模式 |
| `ha` | redis-replica-*, redis-sentinel-* | 高可用 |
| `tools` | redis-commander | 管理工具 |
| `monitoring` | grafana, prometheus | 监控 |

### 有用的链接

- [Docker 文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Redis 文档](https://redis.io/docs/)
- [ClickHouse 文档](https://clickhouse.com/docs/)
- [Trivy 安全扫描](https://aquasecurity.github.io/trivy/)
