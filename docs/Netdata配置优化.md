根据分析结果，我来为你提供完整的Netdata配置优化方案。

  系统技术栈总结

  | 组件     | 详情                               |
  |----------|------------------------------------|
  | 运行时   | Node.js >= 20.0.0 + PM2 (42个进程) |
  | 数据库   | Redis + ClickHouse        |
  | 网络     | 7-8个交易所 WebSocket 长连接       |
  | 监控端口 | Prometheus 9090-9210               |
  | 内存占用 | 预计 42-48GB（全量部署）           |

  ---
  Netdata 配置优化方案

  1. 修改数据保留天数为30天

  编辑 /etc/netdata/netdata.conf:

  [global]
      # 30天 = 30 * 24 * 3600 = 2592000秒
      history = 2592000

      # 或者使用更高效的dbengine模式（推荐）
      memory mode = dbengine

  [db]
      # dbengine模式下的配置
      # 30天数据，每秒1个点
      dbengine multihost disk space MB = 5120

      # 数据保留天数
      dbengine tier 0 retention days = 30
      dbengine tier 1 retention days = 30
      dbengine tier 2 retention days = 30

  2. 需要开启的监控项

  编辑 /etc/netdata/netdata.conf:

  # ========== 核心系统监控（保持开启）==========
  [plugin:proc]
      # CPU监控 - 重要：监控策略计算负载
      /proc/stat = yes
      /proc/loadavg = yes

      # 内存监控 - 重要：Node.js内存泄漏检测
      /proc/meminfo = yes
      /proc/vmstat = yes

      # 网络监控 - 重要：WebSocket连接状态
      /proc/net/dev = yes
      /proc/net/sockstat = yes
      /proc/net/sockstat6 = yes

      # 磁盘IO - 重要：Redis/ClickHouse性能
      /proc/diskstats = yes

      # 进程监控 - 重要：PM2进程状态
      /proc/stat = yes

  [plugin:apps]
      # 进程分组监控 - 非常重要
      enabled = yes

  [plugin:cgroups]
      # 容器/进程组监控
      enabled = yes

  3. 需要开启的应用监控

  创建/编辑 /etc/netdata/go.d.conf:

  # 启用的收集器
  modules:
    # Redis监控 - 必须开启
    redis: yes

    # ClickHouse监控 - 必须开启
    clickhouse: yes

    # Prometheus指标抓取 - 重要：抓取量化系统指标
    prometheus: yes

    # Web服务监控
    web_log: yes

    # TCP端口检测
    portcheck: yes

    # 网络探测
    ping: no  # 可选

  配置Redis监控 /etc/netdata/go.d/redis.conf:

  jobs:
    - name: local_redis
      address: 'redis://:123456@127.0.0.1:6379'

  配置ClickHouse监控 /etc/netdata/go.d/clickhouse.conf:

  jobs:
    - name: local_clickhouse
      url: http://localhost:8123
      username: default
      password: '123456'

  配置Prometheus抓取 /etc/netdata/go.d/prometheus.conf:

  jobs:
    # 抓取量化系统的Prometheus指标
    - name: quant_live_funding
      url: http://127.0.0.1:9090/metrics

    - name: quant_live_sma
      url: http://127.0.0.1:9091/metrics

    # ... 根据实际运行的策略添加更多

  4. 需要关闭的监控项

  编辑 /etc/netdata/netdata.conf:

  # ========== 不需要的数据库监控 ==========
  [plugin:go.d]
      # 关闭不使用的数据库
      mysql = no
      mariadb = no
      postgres = no
      mongodb = no
      elasticsearch = no
      cassandra = no
      couchdb = no
      memcached = no

  # ========== 不需要的Web服务器监控 ==========
  [plugin:go.d]
      nginx = no
      apache = no
      lighttpd = no
      litespeed = no
      tengine = no

  # ========== 不需要的消息队列监控 ==========
  [plugin:go.d]
      rabbitmq = no
      activemq = no
      pulsar = no

  # ========== 不需要的硬件传感器（云服务器）==========
  [plugin:proc]
      /sys/class/hwmon = no
      /sys/devices/system/edac = no
      /sys/class/power_supply = no
      /proc/sys/kernel/random/entropy_avail = no

  [plugin:freeipmi]
      enabled = no

  [plugin:perf]
      enabled = no

  # ========== 不需要的虚拟化监控 ==========
  [plugin:xenstat]
      enabled = no

  # ========== 不需要的其他服务 ==========
  [plugin:go.d]
      docker = no        # 除非使用Docker部署
      kubernetes = no    # 除非使用K8s
      haproxy = no
      squid = no
      varnish = no
      bind = no
      powerdns = no
      unbound = no
      pihole = no
      openvpn = no
      wireguard = no

  # ========== 关闭Python插件（减少资源）==========
  [plugin:python.d]
      enabled = no

  # ========== 关闭不需要的Charts插件 ==========
  [plugin:charts.d]
      enabled = no

  5. 进程监控配置

  编辑 /etc/netdata/apps_groups.conf，添加量化系统进程组:

  # 量化交易系统进程分组
  quant-live: *quant-live*
  quant-shadow: *quant-shadow*
  quant-backtest: *quant-backtest*
  node: node nodejs
  pm2: pm2 PM2

  # Redis
  redis: redis-server redis-sentinel

  # ClickHouse
  clickhouse: clickhouse-server clickhouse-client

  6. 告警配置

  编辑 /etc/netdata/health.d/quant-trading.conf:

  # PM2进程内存告警
  alarm: quant_process_memory
  on: apps.mem
  lookup: max -1m unaligned of quant-live,quant-shadow
  units: MiB
  every: 30s
  warn: $this > 1500
  crit: $this > 2000
  info: Quant trading process memory usage

  # Redis连接数告警
  alarm: redis_connections
  on: redis.connections
  lookup: average -1m unaligned
  units: connections
  every: 10s
  warn: $this > 100
  crit: $this > 200
  info: Redis connected clients

  # Redis内存告警
  alarm: redis_memory
  on: redis.memory
  lookup: average -1m unaligned of used
  units: bytes
  every: 30s
  warn: $this > 4294967296
  crit: $this > 8589934592
  info: Redis memory usage (warn > 4GB, crit > 8GB)

  # 网络连接数告警（WebSocket）
  alarm: tcp_connections
  on: ip.tcpsock
  lookup: average -1m unaligned
  units: sockets
  every: 30s
  warn: $this > 500
  crit: $this > 1000
  info: TCP socket count (WebSocket connections)

  ---
  完整配置脚本

  创建配置脚本 setup-netdata.sh:

  #!/bin/bash

  # 备份原配置
  cp /etc/netdata/netdata.conf /etc/netdata/netdata.conf.bak

  # 主配置文件
  cat > /etc/netdata/netdata.conf << 'EOF'
  [global]
      memory mode = dbengine
      update every = 1

  [db]
      dbengine multihost disk space MB = 5120
      dbengine tier 0 retention days = 30
      dbengine tier 1 retention days = 30
      dbengine tier 2 retention days = 30

  # ===== 开启的监控 =====
  [plugin:proc]
      /proc/stat = yes
      /proc/loadavg = yes
      /proc/meminfo = yes
      /proc/vmstat = yes
      /proc/net/dev = yes
      /proc/net/sockstat = yes
      /proc/diskstats = yes
      /sys/class/hwmon = no
      /sys/devices/system/edac = no

  [plugin:apps]
      enabled = yes

  [plugin:cgroups]
      enabled = yes

  # ===== 关闭的插件 =====
  [plugin:python.d]
      enabled = no

  [plugin:charts.d]
      enabled = no

  [plugin:freeipmi]
      enabled = no

  [plugin:perf]
      enabled = no

  [plugin:xenstat]
      enabled = no
  EOF

  # Go.d 收集器配置
  cat > /etc/netdata/go.d.conf << 'EOF'
  modules:
    redis: yes
    clickhouse: yes
    prometheus: yes
    portcheck: yes
    web_log: no
    mysql: no
    postgres: no
    mongodb: no
    nginx: no
    apache: no
    docker: no
    rabbitmq: no
  EOF

  # Redis监控配置
  cat > /etc/netdata/go.d/redis.conf << 'EOF'
  jobs:
    - name: local_redis
      address: 'redis://:123456@127.0.0.1:6379'
  EOF

  # ClickHouse监控配置
  cat > /etc/netdata/go.d/clickhouse.conf << 'EOF'
  jobs:
    - name: local_clickhouse
      url: http://localhost:8123
      username: default
      password: '123456'
  EOF

  # 进程分组配置
  cat >> /etc/netdata/apps_groups.conf << 'EOF'

  # Quant Trading System
  quant-live: *quant-live*
  quant-shadow: *quant-shadow*
  quant-backtest: *quant-backtest*
  node: node nodejs
  pm2: pm2 PM2
  redis: redis-server
  clickhouse: clickhouse-server
  EOF

  # 重启Netdata
  systemctl restart netdata

  echo "Netdata配置完成！"
  echo "数据保留: 30天"
  echo "访问: http://localhost:19999"

  ---
  配置总结

  | 类别 | 操作                     | 原因                 |
  |------|--------------------------|----------------------|
  | 开启 | Redis监控                | 核心缓存/消息队列    |
  | 开启 | ClickHouse监控           | 历史数据存储         |
  | 开启 | Prometheus抓取           | 量化系统指标         |
  | 开启 | 进程监控(apps)           | PM2进程状态          |
  | 开启 | 网络监控                 | WebSocket连接        |
  | 开启 | 内存/CPU                 | 资源使用             |
  | 关闭 | MySQL/PostgreSQL/MongoDB | 未使用               |
  | 关闭 | Nginx/Apache             | 未使用               |
  | 关闭 | Docker/K8s               | 未使用(除非容器部署) |
  | 关闭 | 硬件传感器               | 云服务器无需         |
  | 关闭 | python.d插件             | 减少资源占用         |

  预计磁盘占用: 30天数据约 3-5GB（取决于监控密度）