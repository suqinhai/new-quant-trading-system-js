/**
 * PM2 生态系统配置文件 - 多策略版本
 * PM2 Ecosystem Configuration File - Multi-Strategy Version
 *
 * 使用方式 / Usage:
 * - pm2 start ecosystem.config.cjs                              # 启动所有应用 / Start all apps
 * - pm2 start ecosystem.config.cjs --only quant-live-funding    # 仅启动 FundingArb 实盘
 * - pm2 start ecosystem.config.cjs --only quant-live-grid       # 仅启动 Grid 实盘
 * - pm2 start ecosystem.config.cjs --only quant-shadow-funding  # 仅启动 FundingArb 影子
 * - pm2 start ecosystem.config.cjs --only quant-live-atr        # 仅启动 ATR突破 实盘
 * - pm2 start ecosystem.config.cjs --only quant-live-bbwidth    # 仅启动 布林宽度 实盘
 * - pm2 start ecosystem.config.cjs --only quant-live-regime     # 仅启动 波动Regime 实盘
 * - pm2 reload ecosystem.config.cjs                             # 零停机重载 / Zero-downtime reload
 * - pm2 stop ecosystem.config.cjs                               # 停止所有 / Stop all
 * - pm2 delete ecosystem.config.cjs                             # 删除所有 / Delete all
 * - pm2 logs                                                    # 查看日志 / View logs
 * - pm2 monit                                                   # 监控面板 / Monitor dashboard
 *
 * 端口分配 / Port Assignment:
 * ┌─────────────────────┬────────────┬─────────┬──────────────┬─────────────┐
 * │ 应用名称             │ HTTP_PORT  │ WS_PORT │ DASHBOARD    │ METRICS     │
 * ├─────────────────────┼────────────┼─────────┼──────────────┼─────────────┤
 * │ quant-live-funding  │ 3000       │ 3001    │ 8080         │ 9090        │
 * │ quant-live-grid     │ 3010       │ 3011    │ 8081         │ 9091        │
 * │ quant-live-sma      │ 3020       │ 3021    │ 8082         │ 9092        │
 * │ quant-live-rsi      │ 3030       │ 3031    │ 8083         │ 9093        │
 * │ quant-live-macd     │ 3040       │ 3041    │ 8084         │ 9094        │
 * │ quant-live-bb       │ 3050       │ 3051    │ 8085         │ 9095        │
 * │ quant-live-atr      │ 3060       │ 3061    │ 8086         │ 9096        │
 * │ quant-live-bbwidth  │ 3070       │ 3071    │ 8087         │ 9097        │
 * │ quant-live-regime   │ 3080       │ 3081    │ 8088         │ 9098        │
 * │ quant-shadow-*      │ 31xx       │ 31xx    │ 81xx         │ 91xx        │
 * └─────────────────────┴────────────┴─────────┴──────────────┴─────────────┘
 */

// 使用 CommonJS 语法因为 PM2 不支持 ES modules 配置
// Using CommonJS syntax because PM2 doesn't support ES modules config

// ============================================
// 通用配置模板 / Common Configuration Template
// ============================================

/**
 * 创建应用配置
 * Create application configuration
 *
 * @param {Object} options - 配置选项
 * @param {string} options.name - 应用名称
 * @param {string} options.mode - 运行模式 (live/shadow)
 * @param {string} options.strategy - 策略名称
 * @param {string} options.symbols - 交易对
 * @param {number} options.httpPort - HTTP 端口
 * @param {number} options.wsPort - WebSocket 端口
 * @param {number} options.dashboardPort - 仪表盘端口
 * @param {number} options.metricsPort - 指标服务端口
 * @param {string} options.maxMemory - 最大内存
 * @returns {Object} PM2 应用配置
 */
function createAppConfig(options) {
  const {
    name,
    mode,
    strategy,
    symbols,
    httpPort,
    wsPort,
    dashboardPort,
    metricsPort,
    maxMemory = '1G',
  } = options;

  const isLive = mode === 'live';
  const verboseFlag = isLive ? '' : ' --verbose';

  return {
    // 应用名称 / Application name
    name,

    // 入口脚本 / Entry script
    script: 'src/main.js',

    // 命令行参数 / Command line arguments
    args: `${mode} --strategy ${strategy} --symbols ${symbols}${verboseFlag}`,

    // ============================================
    // 进程配置 / Process Configuration
    // ============================================

    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: maxMemory,

    // ============================================
    // 环境变量配置 / Environment Variables
    // ============================================

    env: {
      NODE_ENV: isLive ? 'production' : 'development',
      TZ: 'Asia/Shanghai',
      HTTP_PORT: httpPort,
      WS_PORT: wsPort,
      MARKETDATA_PORT: wsPort,
      DASHBOARD_PORT: dashboardPort,
      METRICS_PORT: metricsPort,
    },

    env_production: {
      NODE_ENV: 'production',
      TZ: 'Asia/Shanghai',
      HTTP_PORT: httpPort,
      WS_PORT: wsPort,
      MARKETDATA_PORT: wsPort,
      DASHBOARD_PORT: dashboardPort,
      METRICS_PORT: metricsPort,
    },

    // ============================================
    // 日志配置 / Logging Configuration
    // ============================================

    out_file: `./logs/pm2/${name}-out.log`,
    error_file: `./logs/pm2/${name}-error.log`,
    merge_logs: true,
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',

    // ============================================
    // 重启策略 / Restart Strategy
    // ============================================

    min_uptime: isLive ? '60s' : '30s',
    max_restarts: isLive ? 10 : 15,
    restart_delay: isLive ? 5000 : 3000,

    // ============================================
    // 优雅关闭配置 / Graceful Shutdown Configuration
    // ============================================

    wait_ready: true,
    listen_timeout: 30000,
    kill_timeout: 10000,
    shutdown_with_message: true,
  };
}

// ============================================
// 策略配置定义 / Strategy Configuration Definition
// ============================================

const STRATEGIES = [
  {
    id: 'funding',
    name: 'FundingArb',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '资金费率套利 / Funding Rate Arbitrage',
  },
  {
    id: 'grid',
    name: 'Grid',
    symbols: 'BTC/USDT:USDT',
    description: '网格交易 / Grid Trading',
  },
  {
    id: 'sma',
    name: 'SMA',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '简单移动平均 / Simple Moving Average',
  },
  {
    id: 'rsi',
    name: 'RSI',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '相对强弱指标 / Relative Strength Index',
  },
  {
    id: 'macd',
    name: 'MACD',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: 'MACD 指标策略 / MACD Indicator Strategy',
  },
  {
    id: 'bb',
    name: 'BollingerBands',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '布林带策略 / Bollinger Bands Strategy',
  },
  // 波动率策略 / Volatility Strategies
  {
    id: 'atr',
    name: 'ATRBreakout',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: 'ATR 波动突破 / ATR Volatility Breakout',
  },
  {
    id: 'bbwidth',
    name: 'BollingerWidth',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '布林宽度挤压 / Bollinger Width Squeeze',
  },
  {
    id: 'regime',
    name: 'VolatilityRegime',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '波动率 Regime / Volatility Regime Switch',
  },
];

// ============================================
// 生成应用配置列表 / Generate Application Config List
// ============================================

const apps = [];

// 为每个策略生成 live 和 shadow 配置
// Generate live and shadow config for each strategy
STRATEGIES.forEach((strategy, index) => {
  // 端口基数计算 / Port base calculation
  // live: 3000, 3010, 3020... / shadow: 3100, 3110, 3120...
  const livePortBase = 3000 + index * 10;
  const shadowPortBase = 3100 + index * 10;
  const liveDashboardPort = 8080 + index;
  const shadowDashboardPort = 8180 + index;
  const liveMetricsPort = 9090 + index;
  const shadowMetricsPort = 9190 + index;

  // 实盘配置 / Live configuration
  apps.push(
    createAppConfig({
      name: `quant-live-${strategy.id}`,
      mode: 'live',
      strategy: strategy.name,
      symbols: strategy.symbols,
      httpPort: livePortBase,
      wsPort: livePortBase + 1,
      dashboardPort: liveDashboardPort,
      metricsPort: liveMetricsPort,
      maxMemory: '1G',
    })
  );

  // 影子配置 / Shadow configuration
  apps.push(
    createAppConfig({
      name: `quant-shadow-${strategy.id}`,
      mode: 'shadow',
      strategy: strategy.name,
      symbols: strategy.symbols,
      httpPort: shadowPortBase,
      wsPort: shadowPortBase + 1,
      dashboardPort: shadowDashboardPort,
      metricsPort: shadowMetricsPort,
      maxMemory: '512M',
    })
  );
});

// ============================================
// 回测应用配置 / Backtest Application Configuration
// ============================================

apps.push({
  name: 'quant-backtest',
  script: 'src/main.js',
  args: 'backtest --strategy FundingArb --start 2024-01-01 --end 2024-06-01',
  instances: 1,
  exec_mode: 'fork',
  autorestart: false,
  watch: false,
  max_memory_restart: '2G',
  env: {
    NODE_ENV: 'development',
    TZ: 'Asia/Shanghai',
  },
  out_file: './logs/pm2/backtest-out.log',
  error_file: './logs/pm2/backtest-error.log',
  merge_logs: true,
  time: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
});

// ============================================
// 导出配置 / Export Configuration
// ============================================

module.exports = {
  apps,

  // ============================================
  // 部署配置 (可选) / Deployment Configuration (optional)
  // ============================================
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/quant-trading-system.git',
      path: '/var/www/quant-trading-system',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': 'mkdir -p /var/www/quant-trading-system/logs/pm2',
    },
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
