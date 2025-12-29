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
 * │ quant-live-orderflow│ 3090       │ 3091    │ 8089         │ 9099        │
 * │ quant-live-mtf      │ 3100       │ 3101    │ 8090         │ 9100        │
 * │ quant-live-combo    │ 3110       │ 3111    │ 8091         │ 9101        │
 * │ quant-live-crosssec │ 3120       │ 3121    │ 8092         │ 9102        │
 * │ quant-live-momrank  │ 3130       │ 3131    │ 8093         │ 9103        │
 * │ quant-live-rotation │ 3140       │ 3141    │ 8094         │ 9104        │
 * │ quant-live-fundext  │ 3150       │ 3151    │ 8095         │ 9105        │
 * │ quant-live-crossex  │ 3160       │ 3161    │ 8096         │ 9106        │
 * │ quant-live-statarb  │ 3170       │ 3171    │ 8097         │ 9107        │
 * │ quant-live-riskdriven│ 3180      │ 3181    │ 8098         │ 9108        │
 * │ quant-live-adaptive │ 3190       │ 3191    │ 8099         │ 9109        │
 * │ quant-live-factors  │ 3200       │ 3201    │ 8100         │ 9110        │
 * │ quant-shadow-*      │ 32xx       │ 32xx    │ 82xx         │ 92xx        │
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

  // 将 maxMemory 转换为 MB 用于 Node.js --max-old-space-size
  // Convert maxMemory to MB for Node.js --max-old-space-size
  const memoryToMB = (mem) => {
    const match = mem.match(/^(\d+)(M|G)$/i);
    if (!match) return 1024; // 默认 1GB
    const value = parseInt(match[1], 10);
    const unit = match[2].toUpperCase();
    return unit === 'G' ? value * 1024 : value;
  };
  const maxOldSpaceSize = memoryToMB(maxMemory);

  return {
    // 应用名称 / Application name
    name,

    // 入口脚本 / Entry script
    script: 'src/main.js',

    // 命令行参数 / Command line arguments
    args: `${mode} --strategy ${strategy} --symbols ${symbols}${verboseFlag}`,

    // Node.js 参数 - 设置最大堆内存
    // Node.js arguments - set max heap memory
    node_args: `--max-old-space-size=${maxOldSpaceSize}`,

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
    kill_timeout: 15000,  // 增加到 15 秒以确保 HTTP 服务器完全关闭 / Increased to 15s to ensure HTTP server fully closes
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
  // 订单流策略 / Order Flow Strategy
  {
    id: 'orderflow',
    name: 'OrderFlow',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '订单流/成交行为策略 / Order Flow / Trade Behavior Strategy',
  },
  // 多周期共振策略 / Multi-Timeframe Resonance Strategy
  {
    id: 'mtf',
    name: 'MultiTimeframe',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '多周期共振策略 (1H趋势+15M回调+5M入场) / Multi-Timeframe Resonance Strategy',
  },
  // 加权组合策略 / Weighted Combo Strategy
  {
    id: 'combo',
    name: 'WeightedCombo',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '加权组合策略 (SMA+RSI+MACD打分) / Weighted Combo Strategy (Signal Scoring)',
  },
  // 横截面策略 / Cross-Sectional Strategies
  {
    id: 'crosssectional',
    name: 'CrossSectional',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT,ADA/USDT:USDT,AVAX/USDT:USDT,DOGE/USDT:USDT,DOT/USDT:USDT,MATIC/USDT:USDT',
    description: '横截面策略 (多币种排名轮动) / Cross-Sectional Strategy (Multi-Asset Ranking Rotation)',
  },
  {
    id: 'momentumrank',
    name: 'MomentumRank',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT,ADA/USDT:USDT,AVAX/USDT:USDT,DOGE/USDT:USDT,DOT/USDT:USDT,MATIC/USDT:USDT',
    description: '动量排名策略 / Momentum Ranking Strategy',
  },
  {
    id: 'rotation',
    name: 'Rotation',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT,ADA/USDT:USDT,AVAX/USDT:USDT,DOGE/USDT:USDT,DOT/USDT:USDT,MATIC/USDT:USDT',
    description: '板块轮动策略 / Sector Rotation Strategy',
  },
  {
    id: 'fundingextreme',
    name: 'FundingRateExtreme',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT,ADA/USDT:USDT,AVAX/USDT:USDT,DOGE/USDT:USDT,DOT/USDT:USDT,MATIC/USDT:USDT',
    description: '资金费率极值策略 / Funding Rate Extreme Strategy',
  },
  {
    id: 'crossexchange',
    name: 'CrossExchangeSpread',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT',
    description: '跨交易所价差策略 / Cross-Exchange Spread Strategy',
  },
  // 统计套利策略 / Statistical Arbitrage Strategy
  {
    id: 'statarb',
    name: 'StatisticalArbitrage',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,AVAX/USDT:USDT',
    description: '统计套利策略 (配对交易/协整/跨所套利/期现基差) / Statistical Arbitrage Strategy',
  },
  // 风控驱动策略 / Risk-Driven Strategy
  {
    id: 'riskdriven',
    name: 'RiskDriven',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '风控驱动策略 (目标波动率/最大回撤/波动突破/风险平价) / Risk-Driven Strategy',
  },
  // 自适应参数策略 / Adaptive Strategy
  {
    id: 'adaptive',
    name: 'Adaptive',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT',
    description: '自适应参数策略 (SMA/RSI/BB 参数随市场状态动态调整) / Adaptive Strategy',
  },
  // 因子投资策略 / Factor Investing Strategy
  {
    id: 'factors',
    name: 'FactorInvesting',
    symbols: 'BTC/USDT:USDT,ETH/USDT:USDT,BNB/USDT:USDT,SOL/USDT:USDT,XRP/USDT:USDT,ADA/USDT:USDT,AVAX/USDT:USDT,DOGE/USDT:USDT,DOT/USDT:USDT,MATIC/USDT:USDT,LINK/USDT:USDT,UNI/USDT:USDT,ATOM/USDT:USDT,LTC/USDT:USDT,FIL/USDT:USDT',
    description: '因子投资策略 (动量/波动率/资金流/换手率) / Factor Investing Strategy',
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
  // 根据交易对数量动态分配内存 / Dynamically allocate memory based on symbol count
  const symbolCount = strategy.symbols.split(',').length;
  // 多币种策略需要更多内存 / Multi-symbol strategies need more memory
  // >= 10 个币种: 6G, > 5 个币种: 4G, > 2 个币种: 1.5G, 其他: 512M
  const shadowMaxMemory = symbolCount >= 10 ? '6G' : (symbolCount > 5 ? '4G' : (symbolCount > 2 ? '1500M' : '512M'));

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
      maxMemory: shadowMaxMemory,
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
