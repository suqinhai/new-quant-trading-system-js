#!/bin/bash

#===============================================================================
# Netdata 配置脚本 - 量化交易系统专用
#
# 功能：
#   - 数据保留30天
#   - 开启 Redis/ClickHouse/Prometheus 监控
#   - 开启进程/网络/内存监控
#   - 关闭不需要的监控项
#   - 配置量化系统告警规则
#
# 使用方法：
#   chmod +x setup-netdata.sh
#   sudo ./setup-netdata.sh
#===============================================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Netdata 配置 - 量化交易系统专用${NC}"
echo -e "${GREEN}========================================${NC}"

# 检查root权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 检查Netdata是否安装
if ! command -v netdata &> /dev/null; then
    echo -e "${RED}Netdata 未安装，请先安装 Netdata${NC}"
    echo "安装命令: bash <(curl -Ss https://my-netdata.io/kickstart.sh)"
    exit 1
fi

# 检测Netdata配置目录
if [ -d "/etc/netdata" ]; then
    NETDATA_CONF_DIR="/etc/netdata"
elif [ -d "/opt/netdata/etc/netdata" ]; then
    NETDATA_CONF_DIR="/opt/netdata/etc/netdata"
else
    echo -e "${RED}未找到 Netdata 配置目录${NC}"
    exit 1
fi

echo -e "${YELLOW}配置目录: ${NETDATA_CONF_DIR}${NC}"

# 创建备份目录
BACKUP_DIR="${NETDATA_CONF_DIR}/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 备份现有配置
echo -e "${YELLOW}[1/8] 备份现有配置...${NC}"
for file in netdata.conf go.d.conf apps_groups.conf; do
    if [ -f "${NETDATA_CONF_DIR}/${file}" ]; then
        cp "${NETDATA_CONF_DIR}/${file}" "${BACKUP_DIR}/"
        echo "  已备份: ${file}"
    fi
done
if [ -d "${NETDATA_CONF_DIR}/go.d" ]; then
    cp -r "${NETDATA_CONF_DIR}/go.d" "${BACKUP_DIR}/"
    echo "  已备份: go.d/"
fi
if [ -d "${NETDATA_CONF_DIR}/health.d" ]; then
    cp -r "${NETDATA_CONF_DIR}/health.d" "${BACKUP_DIR}/"
    echo "  已备份: health.d/"
fi

#===============================================================================
# 主配置文件
#===============================================================================
echo -e "${YELLOW}[2/8] 生成主配置文件...${NC}"

cat > "${NETDATA_CONF_DIR}/netdata.conf" << 'EOF'
# Netdata 主配置 - 量化交易系统专用
# 生成时间: 自动生成

[global]
    # 使用dbengine存储模式，支持长期数据保留
    memory mode = dbengine

    # 数据采集间隔（秒）
    update every = 1

    # 页面刷新间隔
    default port = 19999

[db]
    # 数据保留配置 - 30天
    # Tier 0: 原始数据（每秒）
    # Tier 1: 聚合数据（每分钟）
    # Tier 2: 聚合数据（每小时）

    dbengine multihost disk space MB = 5120
    dbengine tier 0 retention days = 30
    dbengine tier 1 retention days = 30
    dbengine tier 2 retention days = 30

[directories]
    cache = /var/cache/netdata
    config = /etc/netdata
    lib = /var/lib/netdata
    log = /var/log/netdata

[logs]
    # 日志级别: debug, info, notice, warning, error, critical
    level = info

#===============================================================================
# 开启的核心监控
#===============================================================================

[plugin:proc]
    # CPU监控 - 监控策略计算负载
    /proc/stat = yes
    /proc/loadavg = yes
    /proc/uptime = yes

    # 内存监控 - Node.js内存泄漏检测
    /proc/meminfo = yes
    /proc/vmstat = yes

    # 网络监控 - WebSocket连接状态
    /proc/net/dev = yes
    /proc/net/sockstat = yes
    /proc/net/sockstat6 = yes
    /proc/net/netstat = yes
    /proc/net/stat/conntrack = yes

    # 磁盘IO - Redis/ClickHouse性能
    /proc/diskstats = yes

    # 文件描述符 - WebSocket连接数
    /proc/sys/fs/file-nr = yes

    # 关闭不需要的硬件监控（云服务器）
    /sys/class/hwmon = no
    /sys/devices/system/edac = no
    /sys/class/power_supply = no
    /proc/sys/kernel/random/entropy_avail = no
    /sys/class/infiniband = no
    /proc/pressure = yes

[plugin:apps]
    # 进程分组监控 - 监控PM2进程
    enabled = yes
    # 采集间隔
    update every = 1

[plugin:cgroups]
    # 容器/进程组监控
    enabled = yes

[plugin:tc]
    # 流量控制
    enabled = yes

[plugin:idlejitter]
    # CPU抖动检测
    enabled = yes

#===============================================================================
# 关闭的监控插件
#===============================================================================

# Python插件 - 资源占用高，使用go.d替代
[plugin:python.d]
    enabled = no

# Charts.d 插件
[plugin:charts.d]
    enabled = no

# IPMI硬件监控
[plugin:freeipmi]
    enabled = no

# 性能计数器
[plugin:perf]
    enabled = no

# Xen虚拟化
[plugin:xenstat]
    enabled = no

# Debugfs
[plugin:debugfs]
    enabled = no

# eBPF（资源占用高）
[plugin:ebpf]
    enabled = no

# Systemd服务监控（可选开启）
[plugin:systemd-journal]
    enabled = no

#===============================================================================
# Web界面配置
#===============================================================================

[web]
    # 监听地址
    bind to = *

    # 访问控制（可根据需要调整）
    allow connections from = localhost *
    allow dashboard from = localhost *

    # 启用GZIP压缩
    enable gzip compression = yes

    # 默认使用旧版UI (v1)
    # 旧版UI更轻量，适合服务器环境
    default port = 19999
    web files owner = root
    web files group = netdata

    # 强制使用旧版dashboard
    # 访问 http://ip:19999/v1/ 可直接访问旧版
    # 设置为yes后默认打开旧版
    prefer old dashboard = yes

#===============================================================================
# 健康检查配置
#===============================================================================

[health]
    enabled = yes
    # 告警检查间隔
    run at least every seconds = 10
EOF

echo "  主配置文件已生成"

#===============================================================================
# Go.d 收集器配置
#===============================================================================
echo -e "${YELLOW}[3/8] 配置 Go.d 收集器...${NC}"

cat > "${NETDATA_CONF_DIR}/go.d.conf" << 'EOF'
# Go.d 收集器配置 - 量化交易系统专用
# 文档: https://learn.netdata.cloud/docs/agent/collectors/go.d.plugin

enabled: yes
default_run: no

modules:
  #=== 必须开启 ===
  # Redis监控 - 核心缓存
  redis: yes

  # ClickHouse监控 - 时序数据库
  clickhouse: yes

  # Prometheus指标抓取 - 量化系统指标
  prometheus: yes

  # 端口检测 - 服务存活检查
  portcheck: yes

  # 网络探测
  ping: yes

  # 文件检查
  filecheck: yes

  #=== 可选开启 ===
  # HTTP端点检测
  httpcheck: yes

  # Web日志分析（如果有nginx反代）
  web_log: no

  # Docker监控（如果使用Docker）
  docker: no
  docker_engine: no

  #=== 关闭不使用的 ===
  # 数据库
  mysql: no
  mariadb: no
  postgres: no
  pgbouncer: no
  mongodb: no
  elasticsearch: no
  opensearch: no
  cassandra: no
  couchdb: no
  couchbase: no
  memcached: no

  # Web服务器
  nginx: no
  nginxplus: no
  apache: no
  lighttpd: no
  litespeed: no
  tengine: no

  # 消息队列
  rabbitmq: no
  activemq: no
  pulsar: no
  vernemq: no

  # 容器编排
  kubernetes: no
  k8s_state: no
  k8s_kubeproxy: no
  k8s_kubelet: no

  # 负载均衡
  haproxy: no
  traefik: no

  # DNS
  bind: no
  powerdns: no
  powerdns_recursor: no
  unbound: no
  coredns: no
  dnsmasq: no
  dnsmasq_dhcp: no
  pihole: no

  # VPN
  openvpn: no
  openvpn_status_log: no
  wireguard: no

  # 缓存
  squid: no
  varnish: no

  # 日志
  fluentd: no
  logstash: no
  logind: no

  # 其他服务
  consul: no
  zookeeper: no
  hdfs: no
  beanstalk: no
  phpfpm: no
  nvme: no
  smartctl: no
  sensors: no
  lm_sensors: no
  ipmi: no
  isc_dhcpd: no
  ntpd: no
  chrony: no
  snmp: no
  vsphere: no
  vcsa: no
  windows: no
  wmi: no
  adaptec_raid: no
  megacli: no
  storcli: no
  hpssa: no
  scaleio: no
EOF

echo "  Go.d 收集器配置已生成"

#===============================================================================
# 创建 go.d 配置目录
#===============================================================================
echo -e "${YELLOW}[4/8] 配置应用监控...${NC}"

mkdir -p "${NETDATA_CONF_DIR}/go.d"

# Redis监控配置
cat > "${NETDATA_CONF_DIR}/go.d/redis.conf" << 'EOF'
# Redis 监控配置
# 文档: https://learn.netdata.cloud/docs/agent/collectors/go.d.plugin/modules/redis

jobs:
  - name: local_redis
    address: 'redis://:123456@127.0.0.1:6379'
    timeout: 2
    # 如果Redis密码不同，请修改上面的地址

# 如果有多个Redis实例，添加更多job:
#  - name: redis_replica
#    address: 'redis://:password@127.0.0.1:6380'
EOF
echo "  Redis 监控配置已生成"

# ClickHouse监控配置
cat > "${NETDATA_CONF_DIR}/go.d/clickhouse.conf" << 'EOF'
# ClickHouse 监控配置
# 文档: https://learn.netdata.cloud/docs/agent/collectors/go.d.plugin/modules/clickhouse

jobs:
  - name: local_clickhouse
    url: http://localhost:8123
    username: default
    password: '123456'
    timeout: 2
    # 如果ClickHouse配置不同，请修改上面的参数
EOF
echo "  ClickHouse 监控配置已生成"

# Prometheus指标抓取配置
cat > "${NETDATA_CONF_DIR}/go.d/prometheus.conf" << 'EOF'
# Prometheus 指标抓取配置
# 用于抓取量化交易系统导出的指标
# 文档: https://learn.netdata.cloud/docs/agent/collectors/go.d.plugin/modules/prometheus

jobs:
  #=== Live 策略指标 ===
  - name: quant_live_funding
    url: http://127.0.0.1:9090/metrics

  - name: quant_live_grid
    url: http://127.0.0.1:9091/metrics

  - name: quant_live_sma
    url: http://127.0.0.1:9092/metrics

  - name: quant_live_rsi
    url: http://127.0.0.1:9093/metrics

  - name: quant_live_macd
    url: http://127.0.0.1:9094/metrics

  #=== Shadow 策略指标 ===
  - name: quant_shadow_funding
    url: http://127.0.0.1:9190/metrics

  - name: quant_shadow_sma
    url: http://127.0.0.1:9192/metrics

# 注意：根据实际运行的策略添加或删除job
# 端口规则：
#   Live:   9090-9110
#   Shadow: 9190-9210
EOF
echo "  Prometheus 抓取配置已生成"

# 端口检测配置
cat > "${NETDATA_CONF_DIR}/go.d/portcheck.conf" << 'EOF'
# 端口检测配置
# 用于监控关键服务端口存活状态

jobs:
  # Redis
  - name: redis
    host: 127.0.0.1
    ports: [6379]
    timeout: 1

  # ClickHouse HTTP
  - name: clickhouse_http
    host: 127.0.0.1
    ports: [8123]
    timeout: 1

  # ClickHouse Native
  - name: clickhouse_native
    host: 127.0.0.1
    ports: [9000]
    timeout: 1

  # 量化系统 Dashboard (Live)
  - name: quant_dashboard_live
    host: 127.0.0.1
    ports: [8080]
    timeout: 1

  # 量化系统 Dashboard (Shadow)
  - name: quant_dashboard_shadow
    host: 127.0.0.1
    ports: [8180]
    timeout: 1
EOF
echo "  端口检测配置已生成"

# HTTP检测配置
cat > "${NETDATA_CONF_DIR}/go.d/httpcheck.conf" << 'EOF'
# HTTP 端点检测配置
# 用于监控量化系统API健康状态

jobs:
  # 量化系统健康检查 (根据实际API调整)
  - name: quant_health_live
    url: http://127.0.0.1:8080/health
    timeout: 3
    status_accepted: [200]

  - name: quant_health_shadow
    url: http://127.0.0.1:8180/health
    timeout: 3
    status_accepted: [200]
EOF
echo "  HTTP 检测配置已生成"

# Ping检测配置
cat > "${NETDATA_CONF_DIR}/go.d/ping.conf" << 'EOF'
# Ping 检测配置
# 用于监控交易所API延迟

jobs:
  # 国内DNS (网络连通性基准)
  - name: dns_aliyun
    hosts: [223.5.5.5]

  # 如果服务器可以访问外网交易所
  # - name: binance_api
  #   hosts: [api.binance.com]
  #
  # - name: okx_api
  #   hosts: [www.okx.com]
EOF
echo "  Ping 检测配置已生成"

#===============================================================================
# 进程分组配置
#===============================================================================
echo -e "${YELLOW}[5/8] 配置进程分组...${NC}"

# 检查并追加到现有文件
if ! grep -q "quant-live" "${NETDATA_CONF_DIR}/apps_groups.conf" 2>/dev/null; then
cat >> "${NETDATA_CONF_DIR}/apps_groups.conf" << 'EOF'

#===============================================================================
# 量化交易系统进程分组
#===============================================================================

# Live策略进程
quant-live: *quant-live*

# Shadow策略进程
quant-shadow: *quant-shadow*

# Backtest回测进程
quant-backtest: *quant-backtest*

# Node.js 进程
node: node nodejs

# PM2 进程管理器
pm2: pm2 PM2 *pm2*

# Redis
redis: redis-server redis-sentinel redis-cli

# ClickHouse
clickhouse: clickhouse-server clickhouse-client clickhouse-local
EOF
    echo "  进程分组配置已添加"
else
    echo "  进程分组配置已存在，跳过"
fi

#===============================================================================
# 告警规则配置
#===============================================================================
echo -e "${YELLOW}[6/8] 配置告警规则...${NC}"

mkdir -p "${NETDATA_CONF_DIR}/health.d"

cat > "${NETDATA_CONF_DIR}/health.d/quant-trading.conf" << 'EOF'
# 量化交易系统告警规则
# 文档: https://learn.netdata.cloud/docs/agent/health

#===============================================================================
# 进程内存告警
#===============================================================================

alarm: quant_live_memory_high
on: apps.mem
lookup: max -1m unaligned of quant-live
units: MiB
every: 30s
warn: $this > 1500
crit: $this > 2000
delay: down 5m multiplier 1.5 max 1h
info: Quant Live 进程内存使用过高
to: sysadmin

alarm: quant_shadow_memory_high
on: apps.mem
lookup: max -1m unaligned of quant-shadow
units: MiB
every: 30s
warn: $this > 4000
crit: $this > 6000
delay: down 5m multiplier 1.5 max 1h
info: Quant Shadow 进程内存使用过高
to: sysadmin

#===============================================================================
# 进程CPU告警
#===============================================================================

alarm: quant_cpu_high
on: apps.cpu
lookup: average -5m unaligned of quant-live,quant-shadow
units: %
every: 30s
warn: $this > 80
crit: $this > 95
delay: down 5m multiplier 1.5 max 1h
info: Quant 进程CPU使用过高
to: sysadmin

#===============================================================================
# Node.js 进程告警
#===============================================================================

alarm: node_process_count
on: apps.processes
lookup: sum -1m unaligned of node
units: processes
every: 30s
warn: $this < 1
crit: $this < 1
delay: down 1m
info: Node.js 进程数量异常（预期至少1个）
to: sysadmin

#===============================================================================
# Redis 告警
#===============================================================================

alarm: redis_connections_high
on: redis.connections
lookup: average -1m unaligned of connected_clients
units: connections
every: 10s
warn: $this > 100
crit: $this > 200
delay: down 5m
info: Redis 连接数过高
to: sysadmin

alarm: redis_memory_high
on: redis.memory
lookup: average -1m unaligned of used_memory
units: bytes
every: 30s
warn: $this > 4294967296
crit: $this > 8589934592
delay: down 5m
info: Redis 内存使用过高 (警告 > 4GB, 严重 > 8GB)
to: sysadmin

alarm: redis_blocked_clients
on: redis.clients
lookup: average -1m unaligned of blocked
units: clients
every: 10s
warn: $this > 10
crit: $this > 50
info: Redis 阻塞客户端数量过高
to: sysadmin

alarm: redis_rejected_connections
on: redis.connections
lookup: sum -1m unaligned of rejected
units: connections
every: 30s
warn: $this > 0
info: Redis 拒绝连接（可能达到maxclients限制）
to: sysadmin

#===============================================================================
# ClickHouse 告警
#===============================================================================

alarm: clickhouse_queries_running
on: clickhouse.queries
lookup: average -1m unaligned of running
units: queries
every: 10s
warn: $this > 50
crit: $this > 100
info: ClickHouse 并发查询过多
to: sysadmin

alarm: clickhouse_memory_high
on: clickhouse.memory_usage
lookup: average -1m unaligned
units: bytes
every: 30s
warn: $this > 8589934592
crit: $this > 17179869184
info: ClickHouse 内存使用过高 (警告 > 8GB, 严重 > 16GB)
to: sysadmin

#===============================================================================
# 网络连接告警
#===============================================================================

alarm: tcp_connections_high
on: ip.tcpsock
lookup: average -1m unaligned
units: sockets
every: 30s
warn: $this > 500
crit: $this > 1000
info: TCP 连接数过高（检查WebSocket连接）
to: sysadmin

alarm: tcp_timewait_high
on: ipv4.sockstat_tcp_sockets
lookup: average -5m unaligned of timewait
units: sockets
every: 30s
warn: $this > 5000
crit: $this > 10000
info: TCP TIME_WAIT 状态连接过多
to: sysadmin

#===============================================================================
# 系统资源告警
#===============================================================================

alarm: system_cpu_high
on: system.cpu
lookup: average -5m unaligned of user,system
units: %
every: 30s
warn: $this > 80
crit: $this > 95
delay: down 5m
info: 系统CPU使用率过高
to: sysadmin

alarm: system_ram_high
on: system.ram
calc: $used * 100 / ($used + $free + $cached + $buffers)
units: %
every: 30s
warn: $this > 85
crit: $this > 95
delay: down 5m
info: 系统内存使用率过高
to: sysadmin

alarm: disk_space_low
on: disk.space
calc: $avail * 100 / ($avail + $used)
units: %
every: 1m
warn: $this < 20
crit: $this < 10
delay: down 5m
info: 磁盘可用空间不足
to: sysadmin

#===============================================================================
# 端口存活告警
#===============================================================================

alarm: redis_port_down
on: portcheck.status
lookup: average -30s unaligned of redis
units: boolean
every: 10s
crit: $this == 0
delay: down 1m
info: Redis 端口 6379 无法连接
to: sysadmin

alarm: clickhouse_port_down
on: portcheck.status
lookup: average -30s unaligned of clickhouse_http
units: boolean
every: 10s
crit: $this == 0
delay: down 1m
info: ClickHouse HTTP 端口 8123 无法连接
to: sysadmin
EOF

echo "  告警规则配置已生成"

#===============================================================================
# 配置通知
#===============================================================================
echo -e "${YELLOW}[7/8] 配置告警通知...${NC}"

# 检查是否存在通知配置
if [ -f "${NETDATA_CONF_DIR}/health_alarm_notify.conf" ]; then
    echo "  告警通知配置已存在"
    echo "  如需配置邮件/Telegram通知，请编辑: ${NETDATA_CONF_DIR}/health_alarm_notify.conf"
else
    cat > "${NETDATA_CONF_DIR}/health_alarm_notify.conf" << 'EOF'
# 告警通知配置
# 文档: https://learn.netdata.cloud/docs/agent/health/notifications

###############################################################################
# 通用设置
###############################################################################

# 发送告警的收件人 (空格分隔)
DEFAULT_RECIPIENT_EMAIL="root"

# 告警发送间隔（秒）
SEND_SLACK=""
SEND_EMAIL="YES"
SEND_TELEGRAM="NO"

###############################################################################
# 邮件配置
###############################################################################

# 邮件发送程序 (sendmail/mailx)
EMAIL_SENDER="netdata@$(hostname)"

###############################################################################
# Telegram 配置
###############################################################################

# 如需启用Telegram通知，取消以下注释并填写TOKEN和CHAT_ID
# SEND_TELEGRAM="YES"
# TELEGRAM_BOT_TOKEN=""
# DEFAULT_RECIPIENT_TELEGRAM=""

###############################################################################
# 自定义收件人
###############################################################################

# 可为不同告警配置不同收件人
# role_recipients_email[sysadmin]="admin@example.com"
# role_recipients_telegram[sysadmin]="CHAT_ID"
EOF
    echo "  告警通知配置模板已生成"
fi

#===============================================================================
# 重启服务
#===============================================================================
echo -e "${YELLOW}[8/8] 重启 Netdata 服务...${NC}"

# 检测服务管理器
if command -v systemctl &> /dev/null; then
    systemctl restart netdata
    systemctl enable netdata
    echo "  Netdata 服务已重启 (systemd)"
elif command -v service &> /dev/null; then
    service netdata restart
    echo "  Netdata 服务已重启 (service)"
else
    # 直接重启
    killall netdata 2>/dev/null || true
    sleep 2
    netdata
    echo "  Netdata 已直接重启"
fi

# 等待服务启动
sleep 3

# 检查服务状态
if curl -s http://localhost:19999/api/v1/info > /dev/null 2>&1; then
    echo -e "${GREEN}  Netdata 服务运行正常${NC}"
else
    echo -e "${YELLOW}  Netdata 服务启动中，请稍后检查${NC}"
fi

#===============================================================================
# 完成提示
#===============================================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  配置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "配置摘要："
echo -e "  - 数据保留: ${GREEN}30天${NC}"
echo -e "  - 存储空间: ${GREEN}5GB${NC}"
echo -e "  - 备份目录: ${BACKUP_DIR}"
echo ""
echo -e "访问地址："
echo -e "  - 本地: ${GREEN}http://localhost:19999${NC}"
echo -e "  - 远程: ${GREEN}http://$(hostname -I | awk '{print $1}'):19999${NC}"
echo ""
echo -e "监控项目："
echo -e "  ${GREEN}[开启]${NC} Redis监控"
echo -e "  ${GREEN}[开启]${NC} ClickHouse监控"
echo -e "  ${GREEN}[开启]${NC} Prometheus指标抓取"
echo -e "  ${GREEN}[开启]${NC} 进程分组监控 (quant-live/shadow)"
echo -e "  ${GREEN}[开启]${NC} 端口存活检测"
echo -e "  ${GREEN}[开启]${NC} 系统资源监控 (CPU/内存/磁盘/网络)"
echo -e "  ${RED}[关闭]${NC} MySQL/PostgreSQL/MongoDB"
echo -e "  ${RED}[关闭]${NC} Nginx/Apache"
echo -e "  ${RED}[关闭]${NC} Docker/Kubernetes"
echo -e "  ${RED}[关闭]${NC} 硬件传感器"
echo ""
echo -e "${YELLOW}注意事项：${NC}"
echo -e "  1. 如果Redis/ClickHouse密码不同，请修改以下文件："
echo -e "     - ${NETDATA_CONF_DIR}/go.d/redis.conf"
echo -e "     - ${NETDATA_CONF_DIR}/go.d/clickhouse.conf"
echo ""
echo -e "  2. 根据实际运行的策略，调整Prometheus抓取配置："
echo -e "     - ${NETDATA_CONF_DIR}/go.d/prometheus.conf"
echo ""
echo -e "  3. 如需配置邮件/Telegram告警通知："
echo -e "     - ${NETDATA_CONF_DIR}/health_alarm_notify.conf"
echo ""
echo -e "${GREEN}配置脚本执行完毕！${NC}"
