# 故障排查指南

## 目录

1. [快速诊断](#1-快速诊断)
2. [启动问题](#2-启动问题)
3. [连接问题](#3-连接问题)
4. [交易问题](#4-交易问题)
5. [策略问题](#5-策略问题)
6. [性能问题](#6-性能问题)
7. [数据问题](#7-数据问题)
8. [API 问题](#8-api-问题)
9. [Docker 问题](#9-docker-问题)
10. [日志分析](#10-日志分析)

---

## 1. 快速诊断

### 1.1 健康检查命令

```bash
# 检查系统状态
curl http://localhost:3000/api/health

# 检查系统详细状态
curl http://localhost:3000/api/system/status

# 检查 PM2 进程
pm2 status

# 检查 Docker 容器
docker-compose ps

# 检查端口占用
netstat -tlnp | grep -E '3000|6379|8123'
```

### 1.2 常见状态码

| 状态码 | 含义 | 处理方法 |
|--------|------|----------|
| 200 | 正常 | 无需处理 |
| 401 | 未授权 | 检查 Token 是否有效 |
| 403 | 权限不足 | 检查用户角色权限 |
| 404 | 资源不存在 | 检查 URL 是否正确 |
| 429 | 请求过多 | 等待限流窗口重置 |
| 500 | 服务器错误 | 查看错误日志 |
| 502 | 网关错误 | 检查后端服务是否运行 |
| 503 | 服务不可用 | 检查服务健康状态 |

### 1.3 快速恢复命令

```bash
# 重启所有服务
docker-compose restart
# 或
pm2 restart all

# 清理并重启
docker-compose down && docker-compose up -d

# 强制重建
docker-compose up -d --force-recreate
```

---

## 2. 启动问题

### 2.1 服务无法启动

**症状：** 执行启动命令后服务立即退出

**诊断步骤：**

```bash
# 查看错误日志
pm2 logs trading-engine --err --lines 50
# 或
docker-compose logs quant-shadow --tail=50
```

**常见原因及解决方案：**

| 原因 | 解决方案 |
|------|----------|
| 端口被占用 | `lsof -i :3000` 找到占用进程并终止 |
| 配置文件错误 | 检查 `.env` 文件格式 |
| 依赖未安装 | 运行 `pnpm install` |
| Node 版本不对 | 使用 `nvm use 20` 切换版本 |
| 权限问题 | 检查文件权限 `chmod -R 755 .` |

**端口占用解决：**

```bash
# 查找占用端口的进程
lsof -i :3000

# 终止进程
kill -9 <PID>

# 或者修改应用端口
export PORT=3001
```

### 2.2 依赖安装失败

**症状：** `pnpm install` 报错

**解决方案：**

```bash
# 清理缓存
pnpm store prune

# 删除 node_modules 重装
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 如果是 native 模块问题
npm rebuild better-sqlite3
```

### 2.3 配置文件错误

**症状：** `Error: Cannot find module` 或 `SyntaxError`

**检查配置：**

```bash
# 验证 JSON 配置格式
cat config/default.json | jq .

# 检查环境变量
grep -v '^#' .env | grep -v '^$'

# 检查必要的环境变量
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

---

## 3. 连接问题

### 3.1 交易所连接失败

**症状：** `Exchange connection failed` 或 `ETIMEDOUT`

**诊断步骤：**

```bash
# 测试网络连通性
ping api.binance.com
curl -I https://api.binance.com/api/v3/ping

# 检查 DNS 解析
nslookup api.binance.com

# 测试 API 连接
curl http://localhost:3000/api/exchanges/binance/test
```

**常见原因及解决方案：**

| 原因 | 解决方案 |
|------|----------|
| 网络问题 | 检查网络连接，尝试使用代理 |
| API 密钥错误 | 验证 API Key 和 Secret |
| IP 未白名单 | 在交易所添加服务器 IP |
| 时间同步问题 | 同步系统时间 `ntpdate pool.ntp.org` |
| 被封禁 | 联系交易所或更换 IP |

**时间同步：**

```bash
# 检查时间偏差
date
curl -s "https://api.binance.com/api/v3/time" | jq '.serverTime'

# 同步时间
sudo timedatectl set-ntp true
# 或
sudo ntpdate pool.ntp.org
```

### 3.2 Redis 连接失败

**症状：** `Redis connection refused` 或 `ECONNREFUSED`

**诊断步骤：**

```bash
# 检查 Redis 是否运行
docker ps | grep redis
redis-cli ping

# 检查连接配置
echo $REDIS_HOST $REDIS_PORT

# 测试连接
redis-cli -h 127.0.0.1 -p 6379 ping
```

**解决方案：**

```bash
# 启动 Redis
docker-compose up -d redis-master

# 检查 Redis 日志
docker logs quant-redis-master

# 检查配置文件
cat config/redis.conf | grep -E 'bind|port|requirepass'
```

### 3.3 数据库连接失败

**症状：** `Database connection error` 或 `SQLITE_CANTOPEN`

**解决方案：**

```bash
# 检查数据库文件
ls -la data/trading.db

# 检查目录权限
chmod 755 data/
chmod 644 data/trading.db

# 检查磁盘空间
df -h

# 修复损坏的数据库
sqlite3 data/trading.db "PRAGMA integrity_check;"
```

---

## 4. 交易问题

### 4.1 订单执行失败

**症状：** 订单提交后返回错误

**诊断步骤：**

```bash
# 查看交易日志
grep "order" logs/app/trading-$(date +%Y-%m-%d).log | tail -20

# 检查风控状态
curl http://localhost:3000/api/risk/config
```

**常见错误及解决方案：**

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `Insufficient balance` | 余额不足 | 检查账户余额，调整订单大小 |
| `Invalid quantity` | 数量不符合规则 | 检查交易对最小交易量 |
| `Price not valid` | 价格异常 | 检查价格精度要求 |
| `Order would trigger immediately` | 条件单价格问题 | 调整触发价格 |
| `Max position exceeded` | 超过持仓限制 | 调整风控配置或减少持仓 |
| `Daily loss limit reached` | 触发日亏损限制 | 等待次日或调整限制 |

### 4.2 订单延迟

**症状：** 订单执行时间过长

**诊断步骤：**

```bash
# 检查延迟指标
curl http://localhost:3000/api/system/metrics | jq '.latency'

# 检查网络延迟
ping -c 10 api.binance.com

# 检查系统负载
top -bn1 | head -5
```

**优化建议：**

1. 使用地理位置更近的服务器
2. 优化网络路由（使用专线）
3. 减少订单处理逻辑
4. 使用 WebSocket 代替 REST API

### 4.3 滑点过大

**症状：** 实际成交价与预期价格偏差大

**解决方案：**

```bash
# 调整滑点容忍度
# 在策略配置中设置
{
  "slippage": 0.001  # 0.1%
}

# 使用限价单代替市价单
# 分批下单减少市场冲击
```

---

## 5. 策略问题

### 5.1 策略不生成信号

**症状：** 策略运行但无交易信号

**诊断步骤：**

```bash
# 查看策略日志
grep "strategy" logs/app/trading-$(date +%Y-%m-%d).log

# 检查策略状态
curl http://localhost:3000/api/strategies | jq '.data[] | select(.state=="running")'

# 检查行情数据
curl http://localhost:3000/api/exchanges/binance/ticker/BTC%2FUSDT
```

**常见原因：**

| 原因 | 解决方案 |
|------|----------|
| 参数设置不合理 | 回测验证参数有效性 |
| 行情数据未更新 | 检查 WebSocket 连接 |
| 策略逻辑问题 | 添加调试日志 |
| 市场条件不满足 | 正常现象，等待信号 |

### 5.2 策略频繁交易

**症状：** 交易次数异常多，手续费过高

**解决方案：**

```bash
# 添加冷却期
{
  "cooldownPeriod": 60000  # 60秒
}

# 增加信号确认条件
# 调整进出场阈值
```

### 5.3 回测结果与实盘不符

**症状：** 回测盈利但实盘亏损

**可能原因及解决方案：**

| 原因 | 解决方案 |
|------|----------|
| 过拟合 | 使用 Walk-Forward 分析 |
| 未考虑滑点 | 回测时设置合理滑点 |
| 未考虑手续费 | 回测时包含手续费 |
| 行情数据质量 | 使用高质量历史数据 |
| 时间颗粒度 | 使用更细粒度的数据 |

---

## 6. 性能问题

### 6.1 内存泄漏

**症状：** 内存使用持续增长

**诊断步骤：**

```bash
# 查看内存使用
pm2 monit
# 或
docker stats

# 生成内存快照
node --expose-gc -e "gc(); require('./src/index.js')"
```

**解决方案：**

```bash
# 设置内存限制自动重启
# ecosystem.config.js
{
  max_memory_restart: '1G'
}

# 检查可能的泄漏点
# 1. 未清理的定时器
# 2. 未关闭的事件监听器
# 3. 缓存未设置上限
```

### 6.2 CPU 使用率高

**症状：** CPU 占用持续 100%

**诊断步骤：**

```bash
# 查看 CPU 使用
top -p $(pgrep -f "node.*trading")

# 生成 CPU Profile
node --prof src/index.js
node --prof-process isolate-*.log > profile.txt
```

**常见原因：**

1. 无限循环
2. 密集计算未异步化
3. 频繁的 JSON 序列化
4. 过多的日志输出

### 6.3 响应延迟高

**症状：** API 响应时间超过 1 秒

**诊断步骤：**

```bash
# 测试 API 延迟
time curl http://localhost:3000/api/health

# 检查数据库查询
sqlite3 data/trading.db "EXPLAIN QUERY PLAN SELECT * FROM trades LIMIT 100;"
```

**优化建议：**

1. 添加数据库索引
2. 使用 Redis 缓存热点数据
3. 实现分页查询
4. 异步处理耗时操作

---

## 7. 数据问题

### 7.1 数据丢失

**症状：** 历史交易或持仓数据消失

**诊断步骤：**

```bash
# 检查数据库文件
ls -la data/
sqlite3 data/trading.db "SELECT COUNT(*) FROM trades;"

# 检查 Redis 数据
redis-cli KEYS "*"
redis-cli INFO keyspace
```

**恢复步骤：**

```bash
# 从备份恢复
./scripts/backup.sh restore --date 20240115

# 重建索引
sqlite3 data/trading.db "REINDEX;"

# 验证数据完整性
sqlite3 data/trading.db "PRAGMA integrity_check;"
```

### 7.2 数据不同步

**症状：** 显示数据与交易所不一致

**解决方案：**

```bash
# 强制同步持仓
curl -X POST http://localhost:3000/api/positions/sync

# 强制同步余额
curl http://localhost:3000/api/exchanges/binance/balance?force=true

# 重新订阅行情
# 重启 WebSocket 连接
```

### 7.3 行情数据延迟

**症状：** 价格更新不及时

**诊断步骤：**

```bash
# 检查 WebSocket 连接状态
curl http://localhost:3000/api/system/status | jq '.engine'

# 对比实时价格
curl http://localhost:3000/api/exchanges/binance/ticker/BTC%2FUSDT
# vs
curl https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
```

---

## 8. API 问题

### 8.1 认证失败

**症状：** 401 Unauthorized

**解决方案：**

```bash
# 检查 Token 是否过期
# Token 有效期为 24 小时

# 重新登录获取新 Token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 刷新 Token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"xxx"}'
```

### 8.2 请求被限流

**症状：** 429 Too Many Requests

**限流规则：**

| 接口类型 | 限制 | 窗口 |
|---------|------|------|
| 登录 | 5 次 | 15 分钟 |
| 普通查询 | 60 次 | 1 分钟 |
| 交易操作 | 20 次 | 1 分钟 |
| 导出 | 10 次 | 1 小时 |

**解决方案：**

```bash
# 等待限流窗口重置
# 响应头中包含重试时间
# Retry-After: 60

# 或调整限流配置（需管理员权限）
```

### 8.3 CORS 错误

**症状：** 浏览器报 CORS 错误

**解决方案：**

```javascript
// 检查后端 CORS 配置
// src/api/server.js
app.use(cors({
  origin: ['http://localhost:5173', 'https://your-domain.com'],
  credentials: true
}));
```

---

## 9. Docker 问题

### 9.1 容器无法启动

**症状：** 容器状态为 Exited 或 Restarting

**诊断步骤：**

```bash
# 查看容器日志
docker logs quant-trading-shadow

# 查看退出原因
docker inspect quant-trading-shadow | jq '.[0].State'

# 进入容器调试
docker run -it --entrypoint /bin/sh quant-trading-system:latest
```

**常见问题：**

| 问题 | 解决方案 |
|------|----------|
| 健康检查失败 | 增加 `start_period` 时间 |
| 内存不足 | 增加内存限制 |
| 卷挂载失败 | 检查目录权限 |
| 网络问题 | 重建网络 `docker network prune` |

### 9.2 镜像构建失败

**症状：** `docker build` 报错

**解决方案：**

```bash
# 清理构建缓存
docker builder prune

# 无缓存重新构建
docker build --no-cache -t quant-trading-system:latest .

# 检查 Dockerfile 语法
docker build --check .
```

### 9.3 数据卷问题

**症状：** 数据未持久化或权限错误

**解决方案：**

```bash
# 检查卷挂载
docker inspect quant-trading-shadow | jq '.[0].Mounts'

# 修复权限
sudo chown -R 1001:1001 data/ logs/

# 重新创建卷
docker-compose down -v
docker-compose up -d
```

---

## 10. 日志分析

### 10.1 日志位置

| 日志类型 | 位置 | 说明 |
|----------|------|------|
| 应用日志 | `logs/app/trading-*.log` | 交易相关日志 |
| 错误日志 | `logs/app/error-*.log` | 错误信息 |
| 审计日志 | `logs/audit/audit-*.jsonl` | 操作记录 |
| PM2 日志 | `logs/pm2/*.log` | 进程日志 |
| Docker 日志 | `docker logs <container>` | 容器日志 |

### 10.2 日志级别

```
ERROR  > WARN  > INFO  > DEBUG  > TRACE
严重错误  警告    信息    调试     跟踪
```

### 10.3 常用日志搜索

```bash
# 搜索错误
grep -r "ERROR" logs/app/ | tail -20

# 搜索特定时间段
grep "2024-01-15 10:" logs/app/trading-2024-01-15.log

# 搜索特定交易对
grep "BTC/USDT" logs/app/trading-*.log

# 搜索订单相关
grep -E "order|trade|execute" logs/app/trading-*.log

# 统计错误类型
grep "ERROR" logs/app/error-*.log | cut -d']' -f3 | sort | uniq -c | sort -rn

# 分析审计日志
cat logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq 'select(.action=="ORDER_PLACED")'
```

### 10.4 日志格式示例

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "module": "TradingEngine",
  "message": "Order executed",
  "data": {
    "orderId": "order_123",
    "symbol": "BTC/USDT",
    "side": "buy",
    "price": 42000,
    "amount": 0.1
  }
}
```

---

## 附录

### A. 错误码速查表

| 错误码 | 含义 | 处理建议 |
|--------|------|----------|
| `UNAUTHORIZED` | 未认证 | 重新登录 |
| `FORBIDDEN` | 权限不足 | 联系管理员 |
| `VALIDATION_ERROR` | 参数错误 | 检查请求参数 |
| `RATE_LIMIT_EXCEEDED` | 限流 | 等待后重试 |
| `EXCHANGE_ERROR` | 交易所错误 | 检查 API 配置 |
| `INSUFFICIENT_BALANCE` | 余额不足 | 充值或减少数量 |
| `STRATEGY_RUNNING` | 策略运行中 | 先停止策略 |
| `RISK_LIMIT_EXCEEDED` | 触发风控 | 调整风控配置 |
| `DATABASE_ERROR` | 数据库错误 | 检查数据库状态 |
| `INTERNAL_ERROR` | 内部错误 | 查看错误日志 |

### B. 紧急联系人

| 角色 | 联系方式 | 响应时间 |
|------|----------|----------|
| 系统管理员 | admin@example.com | 30 分钟 |
| 技术支持 | support@example.com | 2 小时 |
| 紧急热线 | +86-xxx-xxxx-xxxx | 即时 |

### C. 故障升级流程

1. **P0 - 紧急** (系统完全不可用)
   - 立即通知所有相关人员
   - 启动紧急响应流程
   - 考虑回滚到上一稳定版本

2. **P1 - 严重** (核心功能受影响)
   - 30 分钟内响应
   - 同步通知技术负责人

3. **P2 - 中等** (非核心功能问题)
   - 2 小时内响应
   - 正常工单处理

4. **P3 - 轻微** (UI/文档问题)
   - 下一工作日处理

---

*文档版本: 1.0.0*
*最后更新: 2024-12-23*
