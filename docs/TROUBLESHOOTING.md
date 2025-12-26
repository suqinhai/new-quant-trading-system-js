# 故障排查指南

## 目录

1. [快速诊断](#快速诊断)
2. [启动问题](#启动问题)
3. [连接问题](#连接问题)
4. [交易问题](#交易问题)
5. [性能问题](#性能问题)
6. [数据问题](#数据问题)
7. [告警问题](#告警问题)
8. [常见错误码](#常见错误码)
9. [日志分析](#日志分析)
10. [紧急处理](#紧急处理)

---

## 快速诊断

### 系统状态检查

```bash
# 检查服务状态
pm2 status

# 检查系统资源
pm2 monit

# 检查端口监听
netstat -tlnp | grep -E "3000|9090"

# 检查进程
ps aux | grep node
```

### 健康检查 API

```bash
# 系统健康状态
curl http://localhost:3000/api/system/health

# 预期响应
{
  "success": true,
  "data": {
    "status": "healthy",
    "components": {
      "database": "healthy",
      "redis": "healthy",
      "exchanges": "healthy"
    }
  }
}
```

### 快速诊断流程图

```
系统异常
    │
    ├─→ 服务是否运行？ ─→ 否 ─→ 查看启动问题
    │        │
    │        ↓ 是
    │
    ├─→ API 是否响应？ ─→ 否 ─→ 查看连接问题
    │        │
    │        ↓ 是
    │
    ├─→ 交易所是否连接？ ─→ 否 ─→ 查看交易所连接
    │        │
    │        ↓ 是
    │
    ├─→ 策略是否运行？ ─→ 否 ─→ 查看策略问题
    │        │
    │        ↓ 是
    │
    └─→ 查看详细日志排查
```

---

## 启动问题

### 问题：服务无法启动

**症状：**
```bash
pm2 status
# 显示 status: errored 或 stopped
```

**排查步骤：**

1. **查看启动日志**
```bash
pm2 logs trading-engine --lines 50
```

2. **检查环境变量**
```bash
# 确认 .env 文件存在
cat .env

# 检查必要变量
echo $NODE_ENV
echo $HTTP_PORT
```

3. **检查依赖**
```bash
npm ls
```

**常见原因和解决方案：**

| 原因 | 解决方案 |
|------|----------|
| 依赖缺失 | `npm install` |
| 端口被占用 | `kill $(lsof -t -i:3000)` |
| 配置文件错误 | 检查 `.env` 和 `config/` |
| 权限不足 | `chmod +x src/main.js` |
| Node.js 版本不兼容 | 升级到 Node.js 18+ |

### 问题：端口被占用

**症状：**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方案：**
```bash
# 查找占用端口的进程
lsof -i :3000
netstat -tlnp | grep 3000

# 终止进程
kill -9 <PID>

# 或更改配置端口
HTTP_PORT=3001 npm run start
```

### 问题：内存不足

**症状：**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**解决方案：**
```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" pm2 start ecosystem.config.js

# 或在 ecosystem.config.js 中配置
{
  max_memory_restart: '2G',
  node_args: '--max-old-space-size=4096'
}
```

---

## 连接问题

### 问题：交易所 API 连接失败

**症状：**
```
Error: Exchange connection failed: ETIMEDOUT
```

**排查步骤：**

1. **检查网络连通性**
```bash
# 测试 Binance API
curl -v https://api.binance.com/api/v3/ping

# 测试 Bybit API
curl -v https://api.bybit.com/v3/public/time

# 测试 DNS 解析
nslookup api.binance.com
```

2. **检查 API 密钥**
```bash
# 验证密钥格式
echo $BINANCE_API_KEY | wc -c  # 应该是 64 字符
```

3. **检查 IP 白名单**
- 登录交易所后台
- 确认服务器 IP 在白名单中

**常见原因和解决方案：**

| 原因 | 解决方案 |
|------|----------|
| 网络不通 | 检查防火墙、代理设置 |
| API 密钥错误 | 重新生成 API 密钥 |
| IP 未加白名单 | 在交易所添加服务器 IP |
| 交易所维护 | 等待维护结束 |
| 请求频率过高 | 降低请求频率 |

### 问题：WebSocket 断开

**症状：**
```
WebSocket connection closed unexpectedly
```

**解决方案：**

1. **检查心跳机制**
```javascript
// 系统会自动重连，检查日志确认
pm2 logs trading-engine | grep -i "websocket\|reconnect"
```

2. **检查网络稳定性**
```bash
# 持续 ping 测试
ping -c 100 stream.binance.com
```

3. **调整重连配置**
```javascript
// config/default.js
websocket: {
  reconnectInterval: 5000,
  maxReconnectAttempts: 10
}
```

### 问题：Redis 连接失败

**症状：**
```
Error: Redis connection failed: ECONNREFUSED
```

**解决方案：**

1. **检查 Redis 服务**
```bash
systemctl status redis
redis-cli ping  # 应返回 PONG
```

2. **检查配置**
```bash
# 确认连接参数
echo $REDIS_HOST
echo $REDIS_PORT
```

3. **重启 Redis**
```bash
systemctl restart redis
```

---

## 交易问题

### 问题：订单执行失败

**症状：**
```
Order execution failed: Insufficient balance
```

**排查步骤：**

1. **检查账户余额**
```bash
curl http://localhost:3000/api/exchanges/binance/balance
```

2. **检查订单参数**
```bash
# 查看交易日志
grep "order" /var/log/trading-system/trading.log | tail -20
```

3. **检查交易对状态**
```bash
# 确认交易对可交易
curl "https://api.binance.com/api/v3/exchangeInfo?symbol=BTCUSDT"
```

**常见原因和解决方案：**

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Insufficient balance | 余额不足 | 充值或减小订单量 |
| Invalid quantity | 数量不合规 | 检查最小交易量 |
| Price precision | 价格精度错误 | 调整价格精度 |
| Market closed | 市场关闭 | 等待开市 |
| Rate limit | 频率限制 | 降低下单频率 |

### 问题：策略信号未执行

**症状：**
策略产生信号但没有实际下单

**排查步骤：**

1. **检查运行模式**
```bash
# 确认不是回测或影子模式
echo $RUN_MODE  # 应该是 'live'
```

2. **检查风控状态**
```bash
curl http://localhost:3000/api/risk/status
```

3. **检查策略状态**
```bash
curl http://localhost:3000/api/strategies
```

4. **查看信号日志**
```bash
grep "signal" /var/log/trading-system/trading.log | tail -20
```

### 问题：止损/止盈未触发

**排查步骤：**

1. **检查订单状态**
```bash
curl http://localhost:3000/api/positions
```

2. **检查触发条件**
- 确认止损/止盈价格设置正确
- 确认行情数据正常更新

3. **检查执行日志**
```bash
grep -E "stop_loss|take_profit" /var/log/trading-system/trading.log
```

---

## 性能问题

### 问题：系统响应缓慢

**症状：**
API 响应时间 > 1秒

**排查步骤：**

1. **检查系统资源**
```bash
# CPU 和内存使用
top -p $(pgrep -f "trading-engine")

# 磁盘 IO
iostat -x 1 5
```

2. **检查事件循环延迟**
```bash
curl http://localhost:9090/metrics | grep eventloop
```

3. **检查数据库性能**
```bash
# Redis
redis-cli info stats
```

**解决方案：**

| 问题 | 解决方案 |
|------|----------|
| CPU 高 | 减少并发策略数量 |
| 内存高 | 增加内存或优化代码 |
| 磁盘 IO 高 | 使用 SSD，优化日志 |
| 事件循环阻塞 | 检查同步操作 |

### 问题：内存泄漏

**症状：**
内存持续增长不释放

**排查步骤：**

1. **监控内存趋势**
```bash
# 持续监控
while true; do
  ps -o rss= -p $(pgrep -f "trading-engine")
  sleep 60
done
```

2. **生成堆快照**
```bash
# 发送 SIGUSR2 信号生成堆快照
kill -USR2 $(pgrep -f "trading-engine")
```

3. **使用诊断工具**
```bash
node --inspect src/main.js
# 在 Chrome DevTools 中分析
```

---

## 数据问题

### 问题：行情数据异常

**症状：**
价格数据明显错误或长时间不更新

**排查步骤：**

1. **检查数据源**
```bash
# 直接查询交易所
curl "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
```

2. **检查 WebSocket 状态**
```bash
pm2 logs marketdata-service | tail -50
```

3. **检查缓存数据**
```bash
redis-cli GET "ticker:BTC/USDT"
```

**解决方案：**
```bash
# 重启行情服务
pm2 restart marketdata-service

# 清除缓存
redis-cli FLUSHDB
```

### 问题：交易记录丢失

**排查步骤：**

1. **检查 Redis 数据**
```bash
redis-cli KEYS "trade:*" | wc -l
redis-cli KEYS "order:*" | wc -l
```

2. **检查 ClickHouse 归档**
```bash
clickhouse-client --query "SELECT COUNT(*) FROM trading.trades"
```

3. **检查日志文件**
```bash
grep "trade" /var/log/trading-system/pnl/*.log
```

---

## 告警问题

### 问题：Telegram 告警不发送

**排查步骤：**

1. **检查配置**
```bash
echo $TELEGRAM_BOT_TOKEN
echo $TELEGRAM_CHAT_ID
```

2. **测试 Bot**
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

3. **手动发送测试消息**
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=Test message"
```

**常见原因：**

| 原因 | 解决方案 |
|------|----------|
| Token 无效 | 重新创建 Bot |
| Chat ID 错误 | 使用 @userinfobot 获取 |
| Bot 未启动 | 向 Bot 发送 /start |
| 网络问题 | 检查网络连通性 |

### 问题：Prometheus 指标缺失

**排查步骤：**

1. **检查指标端点**
```bash
curl http://localhost:9090/metrics
```

2. **检查 Prometheus 配置**
```bash
# prometheus.yml
scrape_configs:
  - job_name: 'trading-system'
    static_configs:
      - targets: ['localhost:9090']
```

3. **检查 Prometheus 目标状态**
```
访问 http://prometheus:9091/targets
```

---

## 常见错误码

### 系统错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|----------|
| SYS_001 | 配置加载失败 | 检查配置文件格式 |
| SYS_002 | 数据库连接失败 | 检查数据库服务 |
| SYS_003 | 内存不足 | 增加内存或优化 |
| SYS_004 | 文件权限错误 | 检查文件权限 |

### 交易错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|----------|
| TRD_001 | 余额不足 | 充值或减小订单 |
| TRD_002 | 订单数量无效 | 检查最小交易量 |
| TRD_003 | 价格超出限制 | 检查价格范围 |
| TRD_004 | 交易对不存在 | 检查交易对配置 |
| TRD_005 | 风控拒绝 | 检查风控设置 |

### 交易所错误码

| 交易所 | 错误码 | 描述 |
|--------|--------|------|
| Binance | -1000 | 未知错误 |
| Binance | -1021 | 时间戳超出范围 |
| Binance | -2010 | 余额不足 |
| Bybit | 10001 | 参数错误 |
| Bybit | 10002 | API 认证失败 |

---

## 日志分析

### 日志位置

```
/var/log/trading-system/
├── trading.log      # 主日志
├── error.log        # 错误日志
├── access.log       # API 访问日志
└── pnl/             # PnL 日志
```

### 常用日志分析命令

```bash
# 查看最近错误
grep -i "error\|fail" /var/log/trading-system/trading.log | tail -50

# 统计错误类型
grep -i "error" /var/log/trading-system/trading.log | \
  sed 's/.*error: //' | sort | uniq -c | sort -rn

# 查看特定时间段
awk '/2024-01-15T10:00/,/2024-01-15T11:00/' /var/log/trading-system/trading.log

# 查看订单执行
grep -E "order|trade|position" /var/log/trading-system/trading.log | tail -100

# 查看连接状态
grep -E "connect|disconnect|websocket" /var/log/trading-system/trading.log | tail -50
```

### 日志级别说明

```
[ERROR] 系统错误，需要立即处理
[WARN]  警告信息，可能需要关注
[INFO]  一般运行信息
[DEBUG] 详细调试信息
```

---

## 紧急处理

### 紧急停止交易

**方法一：API 停止**
```bash
curl -X POST http://localhost:3000/api/system/emergency-stop \
  -H "Authorization: Bearer $TOKEN"
```

**方法二：强制停止**
```bash
pm2 stop all
```

**方法三：终止进程**
```bash
pkill -f "trading-engine"
```

### 紧急平仓

```bash
# 平掉所有持仓
curl -X POST http://localhost:3000/api/positions/close-all \
  -H "Authorization: Bearer $TOKEN"
```

### 应急恢复流程

1. **停止服务**
```bash
pm2 stop all
```

2. **备份当前状态**
```bash
cp -r /var/lib/trading-system/data /var/backups/emergency_$(date +%Y%m%d_%H%M%S)
```

3. **检查并修复问题**
```bash
# 检查日志找出问题原因
tail -500 /var/log/trading-system/error.log
```

4. **恢复服务**
```bash
pm2 start all
pm2 logs
```

5. **验证系统状态**
```bash
curl http://localhost:3000/api/system/health
```

### 联系支持

紧急情况下：
1. 保存系统日志
2. 记录问题现象
3. 截图错误信息
4. 提交 Issue 到项目仓库

---

## 问题报告模板

```markdown
## 问题描述
[简要描述问题]

## 环境信息
- 操作系统：
- Node.js 版本：
- 项目版本：

## 复现步骤
1.
2.
3.

## 预期行为
[描述预期的正常行为]

## 实际行为
[描述实际发生的情况]

## 日志信息
```
[粘贴相关日志]
```

## 已尝试的解决方案
1.
2.
```
