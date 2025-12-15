/**
 * PM2 生态系统配置文件
 * PM2 Ecosystem Configuration File
 *
 * 使用方式 / Usage:
 * - pm2 start ecosystem.config.cjs                 # 启动所有应用 / Start all apps
 * - pm2 start ecosystem.config.cjs --only live     # 仅启动实盘 / Start live only
 * - pm2 start ecosystem.config.cjs --only shadow   # 仅启动影子 / Start shadow only
 * - pm2 reload ecosystem.config.cjs                # 零停机重载 / Zero-downtime reload
 * - pm2 stop ecosystem.config.cjs                  # 停止所有 / Stop all
 * - pm2 delete ecosystem.config.cjs                # 删除所有 / Delete all
 * - pm2 logs                                       # 查看日志 / View logs
 * - pm2 monit                                      # 监控面板 / Monitor dashboard
 */

// 使用 CommonJS 语法因为 PM2 不支持 ES modules 配置
// Using CommonJS syntax because PM2 doesn't support ES modules config

module.exports = {
  // ============================================
  // 应用配置列表 / Application Configuration List
  // ============================================
  apps: [
    // ============================================
    // 实盘交易应用 / Live Trading Application
    // ============================================
    {
      // 应用名称 / Application name
      name: 'quant-live',

      // 入口脚本 / Entry script
      script: 'src/main.js',

      // 命令行参数 / Command line arguments
      args: 'live --strategy FundingArb --symbols BTC/USDT:USDT',

      // ============================================
      // 进程配置 / Process Configuration
      // ============================================

      // 实例数量 (1 表示单实例) / Number of instances (1 for single)
      instances: 1,

      // 执行模式 (fork 或 cluster) / Execution mode (fork or cluster)
      exec_mode: 'fork',

      // 是否自动重启 / Auto restart on crash
      autorestart: true,

      // 是否监听文件变化 / Watch for file changes
      watch: false,

      // 最大内存限制 (超出时重启) / Max memory limit (restart when exceeded)
      max_memory_restart: '1G',

      // ============================================
      // 环境变量配置 / Environment Variables
      // ============================================

      // 默认环境变量 / Default environment variables
      env: {
        // Node 环境 / Node environment
        NODE_ENV: 'production',

        // 时区设置 / Timezone setting
        TZ: 'Asia/Shanghai',
      },

      // 生产环境变量 / Production environment variables
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },

      // 开发环境变量 / Development environment variables
      env_development: {
        NODE_ENV: 'development',
        TZ: 'Asia/Shanghai',
      },

      // ============================================
      // 日志配置 / Logging Configuration
      // ============================================

      // 标准输出日志文件 / Standard output log file
      out_file: './logs/pm2/live-out.log',

      // 错误输出日志文件 / Error output log file
      error_file: './logs/pm2/live-error.log',

      // 合并日志 (所有实例写入同一文件) / Merge logs (all instances to same file)
      merge_logs: true,

      // 日志添加时间戳 / Add timestamp to logs
      time: true,

      // 日志格式化 / Log formatting
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // ============================================
      // 重启策略 / Restart Strategy
      // ============================================

      // 最小运行时间 (毫秒)，少于此时间重启会被视为异常
      // Min uptime (ms), restart within this time considered unstable
      min_uptime: '60s',

      // 异常重启时的最大重试次数 / Max restarts when unstable
      max_restarts: 10,

      // 重启延迟时间 (毫秒) / Restart delay (ms)
      restart_delay: 5000,

      // ============================================
      // 优雅关闭配置 / Graceful Shutdown Configuration
      // ============================================

      // 等待应用准备就绪 / Wait for app ready
      wait_ready: true,

      // 监听超时时间 (毫秒) / Listen timeout (ms)
      listen_timeout: 30000,

      // 关闭超时时间 (毫秒) / Kill timeout (ms)
      kill_timeout: 10000,

      // 关闭信号 / Shutdown signal
      shutdown_with_message: true,

      // ============================================
      // Cron 配置 / Cron Configuration
      // ============================================

      // 定时重启 (每天凌晨 4 点) / Scheduled restart (daily at 4 AM)
      // cron_restart: '0 4 * * *',
    },

    // ============================================
    // 影子模式应用 / Shadow Mode Application
    // ============================================
    {
      // 应用名称 / Application name
      name: 'quant-shadow',

      // 入口脚本 / Entry script
      script: 'src/main.js',

      // 命令行参数 / Command line arguments
      args: 'shadow --strategy FundingArb --symbols BTC/USDT:USDT --verbose',

      // ============================================
      // 进程配置 / Process Configuration
      // ============================================

      // 实例数量 / Number of instances
      instances: 1,

      // 执行模式 / Execution mode
      exec_mode: 'fork',

      // 是否自动重启 / Auto restart
      autorestart: true,

      // 是否监听文件变化 / Watch for file changes
      watch: false,

      // 最大内存限制 / Max memory limit
      max_memory_restart: '512M',

      // ============================================
      // 环境变量 / Environment Variables
      // ============================================

      env: {
        NODE_ENV: 'development',
        TZ: 'Asia/Shanghai',
      },

      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },

      // ============================================
      // 日志配置 / Logging Configuration
      // ============================================

      out_file: './logs/pm2/shadow-out.log',
      error_file: './logs/pm2/shadow-error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // ============================================
      // 重启策略 / Restart Strategy
      // ============================================

      min_uptime: '30s',
      max_restarts: 15,
      restart_delay: 3000,

      // ============================================
      // 优雅关闭配置 / Graceful Shutdown Configuration
      // ============================================

      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
      shutdown_with_message: true,
    },

    // ============================================
    // 回测应用 (可选，一般手动运行)
    // Backtest Application (optional, usually run manually)
    // ============================================
    {
      // 应用名称 / Application name
      name: 'quant-backtest',

      // 入口脚本 / Entry script
      script: 'src/main.js',

      // 命令行参数 / Command line arguments
      args: 'backtest --strategy FundingArb --start 2024-01-01 --end 2024-06-01',

      // ============================================
      // 进程配置 / Process Configuration
      // ============================================

      // 实例数量 / Number of instances
      instances: 1,

      // 执行模式 / Execution mode
      exec_mode: 'fork',

      // 是否自动重启 (回测完成后不需要重启)
      // Auto restart (no need after backtest completes)
      autorestart: false,

      // 是否监听文件变化 / Watch for file changes
      watch: false,

      // 最大内存限制 / Max memory limit
      max_memory_restart: '2G',

      // ============================================
      // 环境变量 / Environment Variables
      // ============================================

      env: {
        NODE_ENV: 'development',
        TZ: 'Asia/Shanghai',
      },

      // ============================================
      // 日志配置 / Logging Configuration
      // ============================================

      out_file: './logs/pm2/backtest-out.log',
      error_file: './logs/pm2/backtest-error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],

  // ============================================
  // 部署配置 (可选) / Deployment Configuration (optional)
  // ============================================
  deploy: {
    // 生产环境部署配置 / Production deployment configuration
    production: {
      // SSH 用户 / SSH user
      user: 'deploy',

      // 服务器地址 / Server address
      host: ['your-server.com'],

      // Git 引用 / Git reference
      ref: 'origin/main',

      // Git 仓库地址 / Git repository URL
      repo: 'git@github.com:your-username/quant-trading-system.git',

      // 部署路径 / Deployment path
      path: '/var/www/quant-trading-system',

      // 部署后执行的命令 / Commands to run after deployment
      'post-deploy': 'npm install && pm2 reload ecosystem.config.cjs --env production',

      // 部署前执行的命令 / Commands to run before deployment
      'pre-setup': 'mkdir -p /var/www/quant-trading-system/logs/pm2',
    },

    // 测试环境部署配置 / Staging deployment configuration
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/quant-trading-system.git',
      path: '/var/www/quant-trading-system-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.cjs --env development',
    },
  },
};
