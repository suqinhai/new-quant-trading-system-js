# 部署运维手册

## 目录

1. [部署架构](#1-部署架构)
2. [环境准备](#2-环境准备)
3. [Docker 部署](#3-docker-部署)
4. [PM2 部署](#4-pm2-部署)
5. [CI/CD 配置](#5-cicd-配置)
6. [监控配置](#6-监控配置)
7. [日志管理](#7-日志管理)
8. [备份恢复](#8-备份恢复)
9. [扩容方案](#9-扩容方案)
10. [安全加固](#10-安全加固)

---

## 1. 部署架构

### 1.1 系统架构图

```
                              ┌─────────────────┐
                              │   Load Balancer │
                              │    (Nginx)      │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  Trading App    │    │  Trading App    │    │  Trading App    │
    │  (Shadow)       │    │  (Live)         │    │  (API Only)     │
    │  Port: 3000     │    │  Port: 3001     │    │  Port: 3002     │
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  Redis Master   │    │  ClickHouse     │    │  Prometheus     │
    │  + Sentinel     │    │  (Analytics)    │    │  + Grafana      │
    │  Port: 6379     │    │  Port: 8123     │    │  Port: 9090     │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.2 服务端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Trading App (Shadow) | 3000 | 影子模式 API |
| Trading App (Live) | 3001 | 实盘模式 API |
| WebSocket | 8080 | 实时数据推送 |
| Metrics | 9091 | Prometheus 指标 |
| Redis Master | 6379 | 缓存服务 |
| Redis Replica | 6380-6381 | 只读副本 |
| Redis Sentinel | 26379-26381 | 高可用监控 |
| ClickHouse | 8123/9000 | 分析数据库 |
| Prometheus | 9090 | 指标收集 |
| Grafana | 3000 | 监控面板 |

### 1.3 资源需求

| 环境 | CPU | 内存 | 磁盘 | 网络 |
|------|-----|------|------|------|
| 开发 | 2 核 | 4 GB | 20 GB | 10 Mbps |
| 测试 | 4 核 | 8 GB | 50 GB | 50 Mbps |
| 生产 | 8 核 | 16 GB | 200 GB SSD | 100 Mbps |

---

## 2. 环境准备

### 2.1 系统要求

```bash
# 操作系统
- Ubuntu 22.04 LTS (推荐)
- CentOS 8+
- Debian 11+

# 软件依赖
- Node.js 20.x LTS
- Docker 24.x+
- Docker Compose 2.x+
- Git 2.x+
```

### 2.2 安装 Node.js

```bash
# 使用 nvm 安装 (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# 验证安装
node -v  # v20.x.x
npm -v   # 10.x.x
```

### 2.3 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 2.4 安装 PM2

```bash
# 全局安装 PM2
npm install -g pm2

# 安装日志轮转模块
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

# 设置开机自启
pm2 startup
```

### 2.5 创建部署用户

```bash
# 创建专用部署用户
sudo useradd -m -s /bin/bash deploy
sudo passwd deploy

# 添加 sudo 权限（可选）
sudo usermod -aG sudo deploy

# 添加到 docker 组
sudo usermod -aG docker deploy

# 切换用户
su - deploy
```

---

## 3. Docker 部署

### 3.1 构建镜像

```bash
# 克隆代码
git clone <repository-url> /opt/quant-trading
cd /opt/quant-trading

# 构建生产镜像
docker build -t quant-trading-system:latest --target production .

# 构建开发镜像
docker build -t quant-trading-system:dev --target development .

# 查看镜像
docker images | grep quant-trading
```

### 3.2 准备配置文件

```bash
# 复制环境配置
cp .env.example .env

# 编辑环境变量
nano .env

# 创建必要目录
mkdir -p data/redis-master data/redis-replica1 data/redis-replica2
mkdir -p data/clickhouse logs/clickhouse backups/redis

# 设置权限
chmod -R 755 data logs backups
```

### 3.3 启动服务

```bash
# 启动基础服务（Redis + ClickHouse + 影子模式应用）
docker-compose up -d

# 启动带高可用的服务
docker-compose --profile ha up -d

# 启动开发环境
docker-compose --profile dev up -d

# 启动实盘模式
docker-compose --profile live up -d

# 启动监控服务
docker-compose --profile monitoring up -d

# 查看运行状态
docker-compose ps
```

### 3.4 服务管理

```bash
# 查看日志
docker-compose logs -f quant-shadow
docker-compose logs -f --tail=100 redis-master

# 重启服务
docker-compose restart quant-shadow

# 停止所有服务
docker-compose down

# 停止并清理数据卷
docker-compose down -v

# 更新服务
docker-compose pull
docker-compose up -d
```

### 3.5 健康检查

```bash
# 检查应用健康状态
curl http://localhost:3000/health

# 检查 Redis
docker exec quant-redis-master redis-cli ping

# 检查 ClickHouse
curl http://localhost:8123/ping
```

---

## 4. PM2 部署

### 4.1 配置文件说明

`ecosystem.config.js` 包含以下服务：

| 服务名 | 入口文件 | 内存限制 | 说明 |
|--------|----------|----------|------|
| trading-engine | src/index.js | 1G | 主交易引擎 |
| marketdata-service | src/marketdata/server.js | 512M | 行情服务 |
| monitor-service | src/monitor/server.js | 256M | 监控服务 |
| web-dashboard | src/monitor/dashboard.js | 256M | Web 面板 |

### 4.2 启动服务

```bash
# 安装依赖
cd /opt/quant-trading
pnpm install --prod

# 启动所有服务（开发环境）
pm2 start ecosystem.config.js

# 启动所有服务（生产环境）
pm2 start ecosystem.config.js --env production

# 启动单个服务
pm2 start ecosystem.config.js --only trading-engine

# 查看状态
pm2 status
```

### 4.3 服务管理

```bash
# 查看日志
pm2 logs                      # 所有日志
pm2 logs trading-engine       # 指定服务日志
pm2 logs --lines 200          # 最近 200 行

# 重启服务
pm2 restart all               # 重启所有
pm2 restart trading-engine    # 重启指定服务
pm2 reload all                # 平滑重启

# 停止服务
pm2 stop all
pm2 stop trading-engine

# 删除服务
pm2 delete all
pm2 delete trading-engine

# 监控面板
pm2 monit
```

### 4.4 保存进程列表

```bash
# 保存当前进程列表
pm2 save

# 恢复进程列表
pm2 resurrect

# 设置开机自启
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
```

---

## 5. CI/CD 配置

### 5.1 GitHub Actions 工作流

项目包含以下 CI/CD 工作流：

| 文件 | 触发条件 | 功能 |
|------|----------|------|
| ci.yml | push/PR | 代码检查、测试 |
| test.yml | push/PR | 运行测试套件 |
| docker-build.yml | push main | 构建 Docker 镜像 |
| deploy.yml | workflow_dispatch | 部署到 staging/production |
| security-scan.yml | schedule | 安全扫描 |

### 5.2 配置 Secrets

在 GitHub 仓库设置中添加以下 Secrets：

```
# Docker Registry
DOCKER_USERNAME
DOCKER_PASSWORD

# Staging 服务器
STAGING_HOST
STAGING_USER
STAGING_SSH_KEY

# Production 服务器
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_SSH_KEY

# 通知（可选）
SLACK_WEBHOOK_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

### 5.3 手动触发部署

1. 进入 GitHub Actions 页面
2. 选择 "Deploy" 工作流
3. 点击 "Run workflow"
4. 选择参数：
   - environment: staging/production
   - deployment_type: rolling/blue-green/canary
   - image_tag: 指定版本或 latest

### 5.4 部署策略

#### 滚动部署 (Rolling)

```bash
# 默认策略，逐个更新实例
./scripts/deploy.sh deploy -e shadow
```

#### 蓝绿部署 (Blue-Green)

```bash
# 准备新版本，验证后切换
./scripts/blue-green-deploy.sh deploy
./scripts/blue-green-deploy.sh switch   # 切换流量
./scripts/blue-green-deploy.sh rollback # 回滚
```

#### 金丝雀部署 (Canary)

```bash
# 先部署少量实例测试
./scripts/deploy.sh deploy -e live --canary
```

---

## 6. 监控配置

### 6.1 Prometheus 配置

`config/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'quant-trading'
    static_configs:
      - targets: ['quant-shadow:9091', 'quant-live:9092']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-master:9121']

  - job_name: 'clickhouse'
    static_configs:
      - targets: ['clickhouse:9363']
```

### 6.2 Grafana Dashboard

1. 访问 `http://localhost:3000` (默认 admin/admin123)
2. 添加数据源：
   - Prometheus: `http://prometheus:9090`
   - ClickHouse: `http://clickhouse:8123`
3. 导入 Dashboard:
   - 使用 `config/grafana/dashboards/` 下的 JSON 文件

### 6.3 告警规则

`config/prometheus/alerts/trading_alerts.yml`:

```yaml
groups:
  - name: trading_alerts
    rules:
      # 应用健康检查
      - alert: TradingAppDown
        expr: up{job="quant-trading"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Trading application is down"

      # 高内存使用
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes > 1073741824
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage exceeds 1GB"

      # 交易延迟
      - alert: HighTradingLatency
        expr: trading_order_latency_seconds > 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Trading latency is high"

      # 订单失败率
      - alert: HighOrderFailureRate
        expr: rate(trading_orders_failed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Order failure rate is high"
```

### 6.4 应用内置指标

系统暴露以下 Prometheus 指标：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| trading_orders_total | Counter | 总订单数 |
| trading_orders_failed_total | Counter | 失败订单数 |
| trading_order_latency_seconds | Histogram | 订单延迟 |
| trading_pnl_total | Gauge | 总盈亏 |
| trading_positions_count | Gauge | 持仓数量 |
| trading_strategies_running | Gauge | 运行中策略数 |

---

## 7. 日志管理

### 7.1 日志目录结构

```
logs/
├── pm2/                    # PM2 日志
│   ├── trading-engine-out.log
│   ├── trading-engine-error.log
│   └── ...
├── app/                    # 应用日志
│   ├── trading-2024-01-15.log
│   ├── error-2024-01-15.log
│   └── audit/              # 审计日志
│       └── audit-2024-01-15.jsonl
├── clickhouse/             # ClickHouse 日志
└── nginx/                  # Nginx 日志
```

### 7.2 日志级别配置

```bash
# .env 文件
LOG_LEVEL=info          # 生产环境
LOG_LEVEL=debug         # 开发环境
LOG_FORMAT=json         # JSON 格式（便于 ELK 收集）
```

日志级别：`error` > `warn` > `info` > `debug` > `trace`

### 7.3 日志轮转配置

PM2 日志轮转已在安装时配置。对于其他日志，使用 logrotate：

`/etc/logrotate.d/quant-trading`:

```
/opt/quant-trading/logs/app/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    dateext
    dateformat -%Y%m%d
}
```

### 7.4 日志查看

```bash
# 实时查看日志
tail -f logs/app/trading-$(date +%Y-%m-%d).log

# 搜索错误
grep -r "ERROR" logs/app/

# 查看审计日志
cat logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# PM2 日志
pm2 logs trading-engine --lines 500
```

---

## 8. 备份恢复

### 8.1 数据备份

```bash
# 创建备份脚本 scripts/backup.sh

#!/bin/bash
BACKUP_DIR="/opt/quant-trading/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 备份 SQLite 数据
cp data/trading.db "$BACKUP_DIR/sqlite/trading_$DATE.db"

# 备份 Redis
docker exec quant-redis-master redis-cli BGSAVE
docker cp quant-redis-master:/data/dump.rdb "$BACKUP_DIR/redis/dump_$DATE.rdb"

# 备份配置
tar -czf "$BACKUP_DIR/config/config_$DATE.tar.gz" config/ .env

# 清理 30 天前的备份
find "$BACKUP_DIR" -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 8.2 自动备份

```bash
# 添加 cron 任务
crontab -e

# 每天凌晨 3 点备份
0 3 * * * /opt/quant-trading/scripts/backup.sh >> /var/log/quant-backup.log 2>&1
```

### 8.3 数据恢复

```bash
# 恢复 SQLite
cp backups/sqlite/trading_20240115_030000.db data/trading.db

# 恢复 Redis
docker cp backups/redis/dump_20240115_030000.rdb quant-redis-master:/data/dump.rdb
docker restart quant-redis-master

# 恢复配置
tar -xzf backups/config/config_20240115_030000.tar.gz -C /opt/quant-trading/
```

### 8.4 远程备份

```bash
# 同步到远程存储
rsync -avz --delete backups/ backup-server:/backups/quant-trading/

# 或使用 S3
aws s3 sync backups/ s3://your-bucket/quant-trading-backups/
```

---

## 9. 扩容方案

### 9.1 垂直扩容

增加单节点资源：

```yaml
# docker-compose.yml
services:
  quant-shadow:
    deploy:
      resources:
        limits:
          memory: 2G    # 增加内存
          cpus: '2.0'   # 增加 CPU
```

### 9.2 水平扩容

增加服务实例：

```bash
# 使用 Docker Compose
docker-compose up -d --scale quant-shadow=3

# 配合负载均衡器使用
```

### 9.3 Redis 集群

从单节点升级到集群：

```bash
# 启用高可用配置
docker-compose --profile ha up -d

# 这将启动：
# - 1 个 Redis Master
# - 2 个 Redis Replica
# - 3 个 Redis Sentinel
```

### 9.4 负载均衡

Nginx 配置示例：

```nginx
upstream quant_api {
    least_conn;
    server 127.0.0.1:3000 weight=5;
    server 127.0.0.1:3001 weight=5;
    server 127.0.0.1:3002 backup;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://quant_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 10. 安全加固

### 10.1 系统安全

```bash
# 配置防火墙
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 禁用 root SSH 登录
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 安装 fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 10.2 应用安全

```bash
# API 密钥加密
export MASTER_KEY="YourSecureMasterPassword123!"
npm run keys:encrypt

# 配置 HTTPS（Let's Encrypt）
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

### 10.3 Docker 安全

```bash
# 使用非 root 用户运行容器（已在 Dockerfile 配置）
# 限制容器资源
# 使用只读文件系统
# 定期更新基础镜像

# 扫描镜像漏洞
docker scan quant-trading-system:latest
```

### 10.4 网络安全

```bash
# 限制 Redis 只允许内部访问
# 在 docker-compose.yml 中不暴露端口到宿主机

# 配置 IP 白名单
# 在交易所 API 设置中配置 IP 白名单
```

### 10.5 安全检查清单

- [ ] API 密钥已加密存储
- [ ] 使用非 root 用户运行服务
- [ ] 配置了 HTTPS
- [ ] 启用了防火墙
- [ ] Redis 未暴露到公网
- [ ] 定期备份数据
- [ ] 定期更新依赖
- [ ] 配置了日志审计
- [ ] 设置了资源限制
- [ ] 交易所 API 配置了 IP 白名单

---

## 附录

### A. 常用运维命令

```bash
# 系统状态
docker-compose ps                  # Docker 服务状态
pm2 status                         # PM2 进程状态
curl localhost:3000/health         # 健康检查

# 日志查看
docker-compose logs -f --tail=100  # Docker 日志
pm2 logs --lines 200               # PM2 日志

# 服务重启
docker-compose restart quant-shadow
pm2 restart trading-engine

# 备份
./scripts/backup.sh

# 部署
./scripts/deploy.sh deploy -e shadow -B
```

### B. 故障恢复流程

1. **服务宕机**
   ```bash
   docker-compose up -d    # 重启 Docker 服务
   pm2 restart all         # 重启 PM2 服务
   ```

2. **数据损坏**
   ```bash
   ./scripts/backup.sh restore --date 20240115
   ```

3. **紧急回滚**
   ```bash
   ./scripts/deploy.sh rollback
   ```

### C. 联系方式

- 技术支持: support@example.com
- 紧急联系: +86-xxx-xxxx-xxxx
- GitHub Issues: https://github.com/xxx/issues

---

*文档版本: 1.0.0*
*最后更新: 2024-12-23*
