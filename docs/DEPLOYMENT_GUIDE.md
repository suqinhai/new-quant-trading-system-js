# 部署运维手册

## 目录

1. [环境准备](#环境准备)
2. [安装部署](#安装部署)
3. [配置说明](#配置说明)
4. [PM2 进程管理](#pm2-进程管理)
5. [Docker 部署](#docker-部署)
6. [监控配置](#监控配置)
7. [日志管理](#日志管理)
8. [备份恢复](#备份恢复)
9. [性能优化](#性能优化)
10. [安全加固](#安全加固)

---

## 环境准备

### 系统要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 20 GB SSD | 100 GB SSD |
| 网络 | 10 Mbps | 100 Mbps+ |
| 操作系统 | Ubuntu 20.04 / CentOS 8 | Ubuntu 22.04 |

### 软件依赖

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # >= 18.0.0
npm --version   # >= 8.0.0

# PM2 进程管理器
npm install -g pm2

# Redis（可选，用于缓存）
sudo apt-get install redis-server

# ClickHouse（可选，用于大数据分析）
# 参考 ClickHouse 官方文档安装
```

### 网络配置

确保服务器可以访问以下域名：

| 服务 | 域名 | 用途 |
|------|------|------|
| Binance | api.binance.com | 交易 API |
| Binance WS | stream.binance.com | WebSocket |
| Bybit | api.bybit.com | 交易 API |
| OKX | www.okx.com | 交易 API |
| Telegram | api.telegram.org | 告警通知 |

---

## 安装部署

### 1. 获取代码

```bash
# 克隆项目
git clone <repository-url> /opt/trading-system
cd /opt/trading-system

# 安装依赖
npm install --production
```

### 2. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置文件
nano .env
```

**.env 配置内容：**

```bash
# 运行环境
NODE_ENV=production

# API 服务器
HTTP_PORT=3000
METRICS_PORT=9090

# 交易所配置
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

BYBIT_API_KEY=your_bybit_api_key
BYBIT_SECRET=your_bybit_secret

OKX_API_KEY=your_okx_api_key
OKX_SECRET=your_okx_secret
OKX_PASSPHRASE=your_okx_passphrase

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# ClickHouse 配置（可选）
CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=trading

# Telegram 告警
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# 日志配置
LOG_LEVEL=info
LOG_DIR=/var/log/trading-system

# 安全配置
JWT_SECRET=your_very_long_random_jwt_secret_key
API_KEY_ENCRYPTION_KEY=your_32_byte_encryption_key
```

### 3. 初始化数据库

```bash
# 创建数据目录
mkdir -p /var/lib/trading-system/data
mkdir -p /var/log/trading-system

# 设置权限
chown -R trading:trading /var/lib/trading-system
chown -R trading:trading /var/log/trading-system
```

### 4. 启动服务

```bash
# 使用 PM2 启动
npm run pm2:start

# 或手动启动
pm2 start ecosystem.config.js
```

---

## 配置说明

### ecosystem.config.js

```javascript
module.exports = {
  apps: [
    {
      name: 'trading-engine',
      script: 'src/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        RUN_MODE: 'live'
      },
      env_shadow: {
        NODE_ENV: 'production',
        RUN_MODE: 'shadow'
      }
    },
    {
      name: 'marketdata-service',
      script: 'src/marketdata/server.js',
      instances: 1,
      max_memory_restart: '512M'
    },
    {
      name: 'monitor-service',
      script: 'src/monitor/server.js',
      instances: 1,
      max_memory_restart: '256M'
    }
  ]
};
```

### 配置文件优先级

1. 环境变量
2. `.env` 文件
3. `config/production.js`
4. `config/default.js`

---

## PM2 进程管理

### 常用命令

```bash
# 启动所有服务
pm2 start ecosystem.config.js

# 启动特定环境
pm2 start ecosystem.config.js --env production
pm2 start ecosystem.config.js --env shadow

# 查看状态
pm2 status

# 查看日志
pm2 logs
pm2 logs trading-engine

# 重启服务
pm2 restart all
pm2 restart trading-engine

# 停止服务
pm2 stop all
pm2 stop trading-engine

# 删除服务
pm2 delete all

# 监控面板
pm2 monit

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
```

### 进程监控

```bash
# 查看详细信息
pm2 show trading-engine

# 查看资源使用
pm2 monit

# 实时日志
pm2 logs --lines 100
```

---

## Docker 部署

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data /app/logs

# 暴露端口
EXPOSE 3000 9090

# 启动命令
CMD ["node", "src/main.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  trading-engine:
    build: .
    container_name: trading-engine
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "9090:9090"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./.env:/app/.env:ro
    environment:
      - NODE_ENV=production
      - RUN_MODE=live
    depends_on:
      - redis
    networks:
      - trading-net

  redis:
    image: redis:7-alpine
    container_name: trading-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    networks:
      - trading-net

  prometheus:
    image: prom/prometheus:latest
    container_name: trading-prometheus
    restart: unless-stopped
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - trading-net

  grafana:
    image: grafana/grafana:latest
    container_name: trading-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    networks:
      - trading-net

volumes:
  redis-data:
  prometheus-data:
  grafana-data:

networks:
  trading-net:
    driver: bridge
```

### Docker 命令

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f trading-engine

# 停止服务
docker-compose down

# 重启服务
docker-compose restart trading-engine
```

---

## 监控配置

### Prometheus 配置

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

scrape_configs:
  - job_name: 'trading-system'
    static_configs:
      - targets: ['trading-engine:9090']
    metrics_path: '/metrics'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Grafana Dashboard

导入以下指标面板：

**交易指标：**
- `trading_pnl_total` - 总盈亏
- `trading_orders_total` - 订单总数
- `trading_positions_count` - 持仓数量
- `trading_balance_total` - 账户余额

**系统指标：**
- `process_cpu_seconds_total` - CPU 使用
- `process_resident_memory_bytes` - 内存使用
- `nodejs_eventloop_lag_seconds` - 事件循环延迟

### 告警规则

**alert_rules.yml:**

```yaml
groups:
  - name: trading-alerts
    rules:
      - alert: HighDrawdown
        expr: trading_drawdown > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "回撤超过 10%"

      - alert: TradingEngineDown
        expr: up{job="trading-system"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "交易引擎离线"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes > 1e9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "内存使用超过 1GB"
```

---

## 日志管理

### 日志目录结构

```
/var/log/trading-system/
├── trading.log          # 主日志
├── error.log            # 错误日志
├── access.log           # API 访问日志
├── audit.log            # 审计日志
└── pnl/                 # PnL 日志
    ├── 2024-01-15.log
    └── ...
```

### 日志级别

| 级别 | 描述 |
|------|------|
| error | 错误信息 |
| warn | 警告信息 |
| info | 一般信息 |
| debug | 调试信息 |

### 日志轮转配置

**/etc/logrotate.d/trading-system:**

```
/var/log/trading-system/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 trading trading
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 查看日志

```bash
# 实时查看主日志
tail -f /var/log/trading-system/trading.log

# 查看错误日志
tail -f /var/log/trading-system/error.log

# 搜索特定内容
grep "ERROR" /var/log/trading-system/trading.log

# 使用 PM2 查看
pm2 logs trading-engine --lines 100
```

---

## 备份恢复

### 自动备份脚本

**backup.sh:**

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/trading-system"
DATE=$(date +%Y%m%d_%H%M%S)
DATA_DIR="/var/lib/trading-system/data"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份配置文件
cp /opt/trading-system/.env $BACKUP_DIR/config_$DATE.env

# 备份 Redis 数据
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# 清理 30 天前的备份
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 定时备份

```bash
# 添加 crontab
crontab -e

# 每天凌晨 2 点执行备份
0 2 * * * /opt/trading-system/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### 恢复数据

```bash
# 停止服务
pm2 stop all

# 恢复 Redis
cp /var/backups/trading-system/redis_20240115_020000.rdb /var/lib/redis/dump.rdb
systemctl restart redis

# 启动服务
pm2 start all
```

---

## 性能优化

### Node.js 优化

```bash
# 增加内存限制
NODE_OPTIONS="--max-old-space-size=4096" pm2 start ecosystem.config.js

# 启用生产模式
NODE_ENV=production
```

### 系统优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# 网络优化
cat >> /etc/sysctl.conf << EOF
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 300
EOF
sysctl -p
```

### Redis 优化

```bash
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save ""
appendonly yes
appendfsync everysec
```

---

## 安全加固

### 防火墙配置

```bash
# 仅开放必要端口
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3000/tcp  # API
ufw allow 9090/tcp  # Metrics（仅内网）
ufw enable
```

### API 密钥安全

1. **使用环境变量**：不要在代码中硬编码密钥
2. **权限最小化**：API 密钥只开放必要权限
3. **IP 白名单**：在交易所设置 IP 白名单
4. **定期轮换**：定期更换 API 密钥

### 文件权限

```bash
# 设置配置文件权限
chmod 600 /opt/trading-system/.env
chown trading:trading /opt/trading-system/.env

# 设置数据目录权限
chmod 700 /var/lib/trading-system
chown -R trading:trading /var/lib/trading-system
```

### SSL/TLS 配置

使用 Nginx 反向代理并配置 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name trading.example.com;

    ssl_certificate /etc/ssl/certs/trading.crt;
    ssl_certificate_key /etc/ssl/private/trading.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 运维检查清单

### 日常检查

- [ ] 系统运行状态 (`pm2 status`)
- [ ] 错误日志检查
- [ ] 持仓和订单状态
- [ ] API 连接状态
- [ ] 磁盘空间使用

### 周期检查

- [ ] 备份验证
- [ ] 日志清理
- [ ] 安全更新
- [ ] 性能指标分析
- [ ] API 密钥轮换

### 紧急处理

```bash
# 紧急停止所有交易
curl -X POST http://localhost:3000/api/system/emergency-stop

# 强制停止服务
pm2 kill

# 检查进程
ps aux | grep node

# 强制终止
kill -9 <pid>
```

---

## 联系支持

如遇到部署问题，请：

1. 查看 [故障排查指南](./TROUBLESHOOTING.md)
2. 检查系统日志
3. 提交 Issue 到项目仓库
