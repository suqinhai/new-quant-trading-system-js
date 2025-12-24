/**
 * PM2 生态系统配置文件
 * PM2 Ecosystem Configuration File
 *
 * 用于管理量化交易系统的多个进程
 * Used for managing multiple processes of the quantitative trading system
 *
 * 使用方法 / Usage:
 * - 启动所有应用: pm2 start ecosystem.config.js
 * - 停止所有应用: pm2 stop ecosystem.config.js
 * - 重启所有应用: pm2 restart ecosystem.config.js
 * - 查看状态: pm2 status
 * - 查看日志: pm2 logs
 */

module.exports = {
  // 应用配置列表 / Application configuration list
  apps: [
    {
      // --------------------------------------------
      // 主交易引擎 / Main Trading Engine
      // --------------------------------------------
      name: 'trading-engine',           // 应用名称，用于 PM2 管理
      script: 'src/index.js',           // 入口文件路径
      instances: 1,                      // 实例数量，交易引擎只能运行一个实例
      autorestart: true,                // 崩溃后自动重启
      watch: false,                     // 生产环境不监听文件变化
      max_memory_restart: '1G',         // 内存超过 1G 时自动重启

      // 环境变量配置 / Environment variables
      env: {
        NODE_ENV: 'development',        // 开发环境
      },
      env_production: {
        NODE_ENV: 'production',         // 生产环境
      },

      // 日志配置 / Log configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',  // 日志时间格式
      error_file: './logs/pm2/trading-engine-error.log',   // 错误日志路径
      out_file: './logs/pm2/trading-engine-out.log',       // 输出日志路径
      merge_logs: true,                 // 合并集群模式下的日志

      // 启动延迟和重启策略 / Startup delay and restart strategy
      wait_ready: true,                 // 等待应用发送 ready 信号
      listen_timeout: 10000,            // 等待 ready 信号的超时时间 (毫秒)
      kill_timeout: 5000,               // 发送 SIGKILL 前的等待时间 (毫秒)

      // 指数退避重启策略 / Exponential backoff restart strategy
      exp_backoff_restart_delay: 1000,  // 初始重启延迟 (毫秒)
    },

    // --------------------------------------------
    // 波动率策略 - ATR 突破 / Volatility - ATR Breakout
    // --------------------------------------------
    {
      name: 'strategy-atr-breakout',
      script: 'examples/runVolatilityStrategies.js',
      args: 'ATRBreakout',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/atr-breakout-error.log',
      out_file: './logs/pm2/atr-breakout-out.log',
      merge_logs: true,
      exp_backoff_restart_delay: 1000,
    },

    // --------------------------------------------
    // 波动率策略 - 布林宽度挤压 / Volatility - Bollinger Width
    // --------------------------------------------
    {
      name: 'strategy-bollinger-width',
      script: 'examples/runVolatilityStrategies.js',
      args: 'BollingerWidth',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/bollinger-width-error.log',
      out_file: './logs/pm2/bollinger-width-out.log',
      merge_logs: true,
      exp_backoff_restart_delay: 1000,
    },

    // --------------------------------------------
    // 波动率策略 - Regime 切换 / Volatility - Regime
    // --------------------------------------------
    {
      name: 'strategy-volatility-regime',
      script: 'examples/runVolatilityStrategies.js',
      args: 'VolatilityRegime',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/volatility-regime-error.log',
      out_file: './logs/pm2/volatility-regime-out.log',
      merge_logs: true,
      exp_backoff_restart_delay: 1000,
    },

    {
      // --------------------------------------------
      // 行情数据服务 / Market Data Service
      // --------------------------------------------
      name: 'marketdata-service',       // 行情数据服务
      script: 'src/marketdata/server.js', // 行情服务入口
      instances: 1,                      // 单实例运行
      autorestart: true,                // 自动重启
      watch: false,                     // 不监听文件变化
      max_memory_restart: '512M',       // 内存限制 512M

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/marketdata-error.log',
      out_file: './logs/pm2/marketdata-out.log',
      merge_logs: true,

      exp_backoff_restart_delay: 1000,
    },

    {
      // --------------------------------------------
      // 监控告警服务 / Monitoring & Alert Service
      // --------------------------------------------
      name: 'monitor-service',          // 监控服务
      script: 'src/monitor/server.js',  // 监控服务入口
      instances: 1,                      // 单实例运行
      autorestart: true,                // 自动重启
      watch: false,                     // 不监听文件变化
      max_memory_restart: '256M',       // 内存限制 256M

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/monitor-error.log',
      out_file: './logs/pm2/monitor-out.log',
      merge_logs: true,

      exp_backoff_restart_delay: 1000,
    },

    {
      // --------------------------------------------
      // Web 监控面板 / Web Dashboard
      // --------------------------------------------
      name: 'web-dashboard',            // Web 面板
      script: 'src/monitor/dashboard.js', // Web 面板入口
      instances: 1,                      // 单实例运行
      autorestart: true,                // 自动重启
      watch: false,                     // 不监听文件变化
      max_memory_restart: '256M',       // 内存限制 256M

      env: {
        NODE_ENV: 'development',
        PORT: 3000,                     // 开发环境端口
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,                     // 生产环境端口
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/dashboard-error.log',
      out_file: './logs/pm2/dashboard-out.log',
      merge_logs: true,

      exp_backoff_restart_delay: 1000,
    },
  ],

  // --------------------------------------------
  // 部署配置 / Deploy Configuration
  // --------------------------------------------
  deploy: {
    production: {
      user: 'deploy',                   // SSH 用户名
      host: 'your-server.com',          // 服务器地址
      ref: 'origin/main',               // Git 分支
      repo: 'git@github.com:your-username/quant-trading-system.git', // Git 仓库
      path: '/home/deploy/quant-trading-system', // 部署路径
      'pre-deploy-local': '',           // 本地部署前执行的命令
      'post-deploy': 'pnpm install && pm2 reload ecosystem.config.js --env production', // 部署后执行的命令
      'pre-setup': '',                  // 首次设置前执行的命令
    },
  },
};
