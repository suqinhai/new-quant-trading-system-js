# 用户使用手册

## 目录

1. [概述](#1-概述)
2. [安装配置](#2-安装配置)
3. [运行模式](#3-运行模式)
4. [Web 界面使用](#4-web-界面使用)
5. [策略管理](#5-策略管理)
6. [风控配置](#6-风控配置)
7. [监控告警](#7-监控告警)
8. [数据导出](#8-数据导出)
9. [最佳实践](#9-最佳实践)

---

## 1. 概述

### 1.1 系统简介

本系统是一套工业级加密货币量化交易平台，提供：

- **多交易所支持**：Binance、OKX、Bybit
- **6 种内置策略**：SMA、RSI、MACD、布林带、网格、资金费率套利
- **完整风控体系**：8 大风控模块，全方位保护资金安全
- **专业回测引擎**：参数优化、Walk-Forward 分析、蒙特卡洛模拟
- **实时监控告警**：Telegram、邮件、钉钉通知

### 1.2 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| CPU | 2 核 | 4 核+ |
| 内存 | 2 GB | 4 GB+ |
| 磁盘 | 10 GB | 50 GB+ SSD |
| Node.js | 20.0.0 | 20.x LTS |
| 操作系统 | Linux/macOS/Windows | Ubuntu 22.04 LTS |

### 1.3 功能架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Web 管理界面                            │
├─────────────────────────────────────────────────────────────┤
│  仪表板  │  策略管理  │  交易记录  │  风控配置  │  系统设置  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      RESTful API                            │
├─────────────────────────────────────────────────────────────┤
│  认证授权  │  限流控制  │  RBAC权限  │  审计日志             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      交易引擎核心                            │
├───────────┬───────────┬───────────┬───────────┬─────────────┤
│  策略模块  │  风控模块  │  执行模块  │  行情模块  │  数据模块  │
└───────────┴───────────┴───────────┴───────────┴─────────────┘
```

---

## 2. 安装配置

### 2.1 快速安装

```bash
# 1. 克隆项目
git clone <repository-url>
cd quant-trading-system

# 2. 安装依赖
pnpm install

# 3. 复制配置文件
cp .env.example .env

# 4. 编辑配置
nano .env
```

### 2.2 交易所 API 配置

#### Binance 配置

1. 登录 [Binance](https://www.binance.com)
2. 进入 API 管理页面
3. 创建新的 API Key（勾选"启用现货交易"）
4. 记录 API Key 和 Secret

```bash
# .env 文件
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
BINANCE_TESTNET=true  # 建议先用测试网
```

#### OKX 配置

1. 登录 [OKX](https://www.okx.com)
2. 进入 API 管理
3. 创建 API Key（设置交易权限和 IP 白名单）
4. 记录 API Key、Secret 和 Passphrase

```bash
OKX_API_KEY=your_api_key
OKX_API_SECRET=your_api_secret
OKX_PASSPHRASE=your_passphrase
OKX_SANDBOX=true
```

#### Bybit 配置

```bash
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
BYBIT_TESTNET=true
```

### 2.3 密钥加密（强烈推荐）

为保护 API 密钥安全，请使用加密存储：

```bash
# 1. 设置主密码（16位以上）
export MASTER_KEY="YourSecureMasterPassword123!"

# 2. 加密密钥
npm run keys:encrypt

# 3. 验证加密
npm run keys:verify

# 4. 删除明文密钥（从 .env 中移除）
```

### 2.4 数据库配置

#### SQLite（默认，无需配置）

系统默认使用 SQLite，数据存储在 `data/` 目录。

#### Redis（可选，用于实时缓存）

```bash
# 安装 Redis
sudo apt install redis-server

# 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_password  # 可选
```

---

## 3. 运行模式

### 3.1 模式说明

| 模式 | 命令 | 说明 | 适用场景 |
|------|------|------|---------|
| 回测模式 | `npm run backtest` | 使用历史数据测试策略 | 策略开发、参数优化 |
| 影子模式 | `npm run shadow` | 真实行情，模拟下单 | 策略验证、系统测试 |
| 实盘模式 | `npm run live` | 真实交易 | 正式运营 |

### 3.2 回测模式

```bash
# 运行回测
npm run backtest

# 指定策略和参数
node examples/runBacktest.js --strategy=sma --symbol=BTC/USDT
```

**回测配置示例：**

```javascript
const config = {
  strategy: 'sma',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  initialCapital: 10000,
  params: {
    fastPeriod: 10,
    slowPeriod: 20,
  },
};
```

### 3.3 影子模式（推荐先使用）

影子模式使用真实行情数据，但不会实际下单：

```bash
npm run shadow
```

影子模式会：
- 订阅真实行情数据
- 执行策略逻辑
- 记录虚拟交易
- 计算模拟盈亏

### 3.4 实盘模式

**警告：实盘模式会使用真实资金交易！**

```bash
# 确认配置正确后启动
npm run live
```

实盘前检查清单：

- [ ] API 密钥已加密
- [ ] 风控参数已设置
- [ ] 影子模式验证通过
- [ ] 资金量符合预期
- [ ] 告警通知已配置

---

## 4. Web 界面使用

### 4.1 启动 Web 服务

```bash
# 启动后端 API
npm run api

# 启动前端界面
cd web && npm run dev
```

访问 `http://localhost:5173` 进入管理界面。

### 4.2 登录

默认账户：
- 用户名：`admin`
- 密码：`admin123`

**首次登录后请立即修改密码！**

### 4.3 仪表板

仪表板展示：

- **资金概览**：总资产、可用余额、持仓市值、今日盈亏
- **收益曲线**：支持 7天/30天/90天 切换
- **持仓列表**：当前持仓详情及浮动盈亏
- **最近交易**：最近 10 笔交易记录
- **系统状态**：CPU、内存、延迟等指标
- **风控告警**：未处理的告警列表

### 4.4 策略管理

#### 创建策略

1. 点击「新建策略」
2. 填写策略信息：
   - 策略名称
   - 策略类型（SMA/RSI/MACD 等）
   - 交易对
   - 初始资金
   - 策略参数
3. 点击「保存」

#### 启动/停止策略

- 点击策略卡片上的「启动」按钮开始运行
- 点击「停止」按钮暂停策略
- 运行中的策略无法编辑参数

#### 回测策略

1. 点击策略卡片上的「回测」按钮
2. 设置回测时间范围和初始资金
3. 查看回测结果（收益率、夏普比率、最大回撤等）

### 4.5 交易记录

- 支持按时间、交易对、方向筛选
- 查看交易详情
- 导出 CSV 文件

### 4.6 系统设置

- **基础设置**：运行模式、日志级别
- **交易所配置**：API 密钥（脱敏显示）、连接测试
- **通知设置**：Telegram、邮件配置
- **用户管理**：修改密码、管理用户

---

## 5. 策略管理

### 5.1 内置策略

| 策略 | 类型 | 说明 |
|------|------|------|
| SMA | 趋势跟踪 | 双均线交叉策略，金叉买入，死叉卖出 |
| RSI | 震荡指标 | RSI 超卖买入，超买卖出 |
| MACD | 趋势动量 | MACD 金叉/死叉 + 柱状图确认 |
| BollingerBands | 均值回归 | 价格触及下轨买入，上轨卖出 |
| Grid | 网格交易 | 固定价格区间内高抛低吸 |
| FundingArb | 套利 | 现货/合约资金费率套利 |

### 5.2 策略参数说明

#### SMA 策略

```javascript
{
  fastPeriod: 10,    // 快线周期（5-20）
  slowPeriod: 20,    // 慢线周期（20-60）
  stopLoss: 0.02,    // 止损比例 2%
  takeProfit: 0.04,  // 止盈比例 4%
}
```

#### RSI 策略

```javascript
{
  period: 14,        // RSI 周期（7-21）
  overbought: 70,    // 超买阈值（65-80）
  oversold: 30,      // 超卖阈值（20-35）
}
```

#### MACD 策略

```javascript
{
  fastPeriod: 12,    // 快线周期
  slowPeriod: 26,    // 慢线周期
  signalPeriod: 9,   // 信号线周期
}
```

### 5.3 策略优化

使用参数网格搜索优化策略：

```bash
node examples/runGridSearch.js --strategy=sma
```

优化结果包括：
- 最优参数组合
- 参数敏感度分析
- 热力图数据

---

## 6. 风控配置

### 6.1 风控参数

| 参数 | 说明 | 建议值 |
|------|------|--------|
| maxPositionRatio | 单仓位最大占比 | 20-30% |
| maxPositions | 最大持仓数量 | 3-5 |
| maxLeverage | 最大杠杆 | 1-3 |
| maxRiskPerTrade | 单笔风险 | 1-2% |
| maxDailyLoss | 日亏损上限 | 5-10% |
| maxDrawdown | 最大回撤 | 15-20% |

### 6.2 止损止盈设置

```javascript
{
  stopLoss: {
    enabled: true,
    defaultRatio: 0.02,     // 止损 2%
    trailingStop: true,     // 启用追踪止损
    trailingRatio: 0.015,   // 回撤 1.5% 触发
  },
  takeProfit: {
    enabled: true,
    defaultRatio: 0.04,     // 止盈 4%
    partialTake: true,      // 分批止盈
    partialRatios: [0.5, 0.3, 0.2],  // 50%/30%/20%
  },
}
```

### 6.3 熔断机制

当触发以下条件时，系统自动停止交易：

- 连续 5 次订单失败
- 日亏损超过设定限额
- 最大回撤超过阈值
- 检测到价格异常波动（黑天鹅）

恢复交易：

1. Web 界面：风控配置 → 点击「启用交易」
2. API：`POST /api/risk/trading/enable`

---

## 7. 监控告警

### 7.1 Telegram 通知

1. 创建 Telegram Bot（@BotFather）
2. 获取 Bot Token 和 Chat ID
3. 配置环境变量：

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321
```

4. 告警类型：
   - 订单成交
   - 策略信号
   - 风控触发
   - 系统异常

### 7.2 邮件通知

```bash
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_password
ALERT_EMAIL_TO=recipient@example.com
```

### 7.3 Prometheus + Grafana

1. 配置 Prometheus：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'quant-trading'
    static_configs:
      - targets: ['localhost:9090']
```

2. 导入 Grafana Dashboard（见 `docs/grafana-dashboard.json`）

---

## 8. 数据导出

### 8.1 交易记录导出

Web 界面：交易记录 → 导出 → 选择格式（CSV/Excel）

API 方式：

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/trades/export?format=csv&startDate=2024-01-01"
```

### 8.2 回测报告导出

回测完成后自动生成报告：

- `reports/backtest_<timestamp>.json` - 完整数据
- `reports/backtest_<timestamp>.html` - 可视化报告

### 8.3 审计日志

审计日志存储在 `logs/audit/` 目录：

```bash
# 查看审计日志
cat logs/audit/audit-2024-01-15.jsonl | jq .
```

---

## 9. 最佳实践

### 9.1 资金管理建议

- **起步资金**：建议使用不超过总资金 10% 的金额测试
- **单策略资金**：每个策略分配 10-20% 资金
- **预留资金**：保持 30% 以上资金作为备用

### 9.2 策略使用建议

1. **先回测**：任何策略上线前必须回测
2. **影子验证**：回测通过后，用影子模式验证 1-2 周
3. **小资金实盘**：先用小资金实盘测试
4. **逐步加仓**：确认稳定后再增加资金

### 9.3 风控建议

- 日亏损限制设为账户的 3-5%
- 单笔止损不超过 2%
- 最大回撤控制在 15% 以内
- 启用追踪止损保护利润

### 9.4 运维建议

- 使用 PM2 管理进程
- 配置自动重启
- 设置日志轮转
- 定期备份数据
- 监控系统资源

### 9.5 安全建议

- API 密钥加密存储
- 设置 IP 白名单
- 定期轮换密钥
- 启用双因素认证（如交易所支持）
- 定期检查审计日志

---

## 附录

### A. 常用命令

```bash
# 系统运行
npm run backtest      # 回测模式
npm run shadow        # 影子模式
npm run live          # 实盘模式

# 密钥管理
npm run keys:encrypt  # 加密密钥
npm run keys:verify   # 验证密钥

# PM2 管理
npm run pm2:start     # 启动
npm run pm2:stop      # 停止
npm run pm2:logs      # 日志
npm run pm2:status    # 状态
```

### B. 联系支持

- GitHub Issues: [提交问题](https://github.com/xxx/issues)
- 技术文档: [在线文档](https://docs.xxx.com)

---

*文档版本: 1.0.0*
*最后更新: 2024-12-23*
