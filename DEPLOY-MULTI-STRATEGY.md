# 多策略Docker部署指南

## 概览

本配置将21个策略拆分为5个独立Docker实例：

| Docker | 名称 | 策略数 | 频率 | 端口 |
|--------|------|--------|------|------|
| #1 | trend-core | 4 | 2-4次/天 | 3001/9101/8001 |
| #2 | tech-alpha | 6 | 5-15次/天 | 3002/9102/8002 |
| #3 | cross-factor | 4 | 3-8次/天 | 3003/9103/8003 |
| #4 | event-risk | 2 | 0-5次/天 | 3004/9104/8004 |
| #5 | hf-arbitrage | 5 | 几十~上百次/天 | 3005/9105/8005 |

## 策略分配

### Docker #1: 趋势核心 (低频骨架)
- SMA - 双均线
- MultiTimeframe - 多时间框架
- RegimeSwitching - 市场制度切换
- VolatilityRegime - 波动率制度

### Docker #2: 技术指标中频 (Alpha)
- RSI
- MACD
- BollingerBands
- ATRBreakout
- BollingerWidth
- Adaptive

### Docker #3: 横截面/因子组合
- Rotation - 强弱轮动
- MomentumRank - 动量排名
- CrossSectional - 横截面
- (WeightedCombo用于组合)

### Docker #4: 事件/风控
- FundingRateExtreme - 资金费率极值
- RiskDriven - 风控驱动

### Docker #5: 高频套利 ⚠️ 独立账户
- Grid - 网格交易
- OrderFlow - 订单流
- StatisticalArbitrage - 统计套利
- CrossExchangeSpread - 跨交易所价差
- FundingArb - 资金费率套利

---

## 部署步骤

### 1. 准备环境

```bash
# 创建必要目录
mkdir -p logs/{trend-core,tech-alpha,cross-factor,event-risk,hf-arbitrage}
mkdir -p data/{trend-core,tech-alpha,cross-factor,event-risk,hf-arbitrage}
mkdir -p data/redis-master data/clickhouse logs/clickhouse

# 复制环境变量文件
cp .env.example .env
cp .env.hf-arbitrage.example .env.hf-arbitrage

# 编辑配置
vim .env              # 主账户API配置
vim .env.hf-arbitrage # 高频套利独立子账户配置
```

### 2. 构建镜像

```bash
# 构建统一镜像
docker-compose -f docker-compose.multi-strategy.yml build
```

### 3. 启动服务

```bash
# 启动所有服务 (Shadow模式 - 推荐先测试)
docker-compose -f docker-compose.multi-strategy.yml up -d

# 或指定运行模式
RUN_MODE=shadow docker-compose -f docker-compose.multi-strategy.yml up -d

# 实盘模式 (确认无误后)
RUN_MODE=live docker-compose -f docker-compose.multi-strategy.yml up -d
```

### 4. 查看状态

```bash
# 查看所有容器状态
docker-compose -f docker-compose.multi-strategy.yml ps

# 查看资源占用
docker stats

# 查看特定实例日志
docker logs -f quant-trend-core
docker logs -f quant-tech-alpha
docker logs -f quant-cross-factor
docker logs -f quant-event-risk
docker logs -f quant-hf-arbitrage
```

---

## 运维命令

### 单独控制实例

```bash
# 停止单个实例
docker stop quant-tech-alpha

# 重启单个实例
docker restart quant-trend-core

# 只启动特定实例
docker-compose -f docker-compose.multi-strategy.yml up -d quant-trend-core quant-tech-alpha
```

### 更新部署

```bash
# 拉取最新代码后重新构建
git pull
docker-compose -f docker-compose.multi-strategy.yml build
docker-compose -f docker-compose.multi-strategy.yml up -d
```

### 查看Metrics

```bash
# 各实例Prometheus指标端点
curl http://localhost:9101/metrics  # trend-core
curl http://localhost:9102/metrics  # tech-alpha
curl http://localhost:9103/metrics  # cross-factor
curl http://localhost:9104/metrics  # event-risk
curl http://localhost:9105/metrics  # hf-arbitrage
```

---

## 资源配置

| 实例 | 内存限制 | CPU限制 | 说明 |
|------|----------|---------|------|
| trend-core | 1G | 1.0 | 低频，资源需求小 |
| tech-alpha | 1.5G | 1.5 | 中频，适中资源 |
| cross-factor | 1.5G | 1.5 | 多币种，适中资源 |
| event-risk | 768M | 0.75 | 事件驱动，资源需求小 |
| hf-arbitrage | 2G | 2.0 | 高频，资源需求大 |
| redis | 2G | - | 共享缓存 |
| clickhouse | 4G | - | 数据存储 |

**总计**: 约 12.8G 内存, 6.75 CPU

---

## 风险隔离

### Docker #5 (hf-arbitrage) 独立要求

1. **独立子账户**: 在交易所创建专门的子账户
2. **独立API Key**: 使用子账户的API Key
3. **独立资金池**: 划转固定资金到子账户
4. **独立风控预算**: 设置独立的每日亏损限制

```bash
# 配置独立API Key
vim .env.hf-arbitrage

# 内容示例:
HF_BINANCE_API_KEY=xxx
HF_BINANCE_API_SECRET=xxx
HF_OKX_API_KEY=xxx
HF_OKX_API_SECRET=xxx
HF_OKX_PASSPHRASE=xxx
```

---

## 监控面板

各实例API端口:
- http://localhost:3001 - trend-core Dashboard
- http://localhost:3002 - tech-alpha Dashboard
- http://localhost:3003 - cross-factor Dashboard
- http://localhost:3004 - event-risk Dashboard
- http://localhost:3005 - hf-arbitrage Dashboard

WebSocket端口:
- ws://localhost:8001 - trend-core WS
- ws://localhost:8002 - tech-alpha WS
- ws://localhost:8003 - cross-factor WS
- ws://localhost:8004 - event-risk WS
- ws://localhost:8005 - hf-arbitrage WS

---

## 故障排查

```bash
# 查看容器日志
docker logs quant-trend-core --tail 100

# 进入容器调试
docker exec -it quant-trend-core sh

# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' quant-trend-core

# 查看网络连接
docker network inspect quant-network
```

---

## 备份与恢复

```bash
# 备份数据
tar -czvf backup-$(date +%Y%m%d).tar.gz data/ logs/

# 恢复数据
tar -xzvf backup-20240101.tar.gz
```
