#!/usr/bin/env node
/**
 * 共享行情服务启动入口
 * Shared Market Data Service Entry Point
 *
 * 使用方法 / Usage:
 *   node src/services/market-data-service.js
 *
 * 环境变量 / Environment Variables:
 *   REDIS_HOST - Redis 主机 (默认: localhost)
 *   REDIS_PORT - Redis 端口 (默认: 6379)
 *   REDIS_PASSWORD - Redis 密码
 *   REDIS_DB - Redis 数据库 (默认: 0)
 *   MARKET_DATA_EXCHANGES - 交易所列表 (默认: binance,okx,bybit)
 *   TRADING_TYPE - 交易类型 (默认: swap)
 *   MARKET_DATA_SYMBOLS - 指定订阅的交易对 (可选，逗号分隔)
 *   SUBSCRIBE_ALL - 是否订阅所有交易对 (默认: true)
 */

import { MarketDataService } from './MarketDataService.js';

// 日志前缀 / Log prefix
const LOG_PREFIX = '[MarketDataServiceRunner]';

/**
 * 解析命令行参数
 * Parse command line arguments
 *
 * @returns {Object} 配置对象 / Configuration object
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--exchanges' && args[i + 1]) {
      config.exchanges = args[++i].split(',');
    } else if (arg === '--symbols' && args[i + 1]) {
      config.symbols = args[++i].split(',');
    } else if (arg === '--trading-type' && args[i + 1]) {
      config.tradingType = args[++i];
    } else if (arg === '--redis-host' && args[i + 1]) {
      config.redis = config.redis || {};
      config.redis.host = args[++i];
    } else if (arg === '--redis-port' && args[i + 1]) {
      config.redis = config.redis || {};
      config.redis.port = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

/**
 * 打印帮助信息
 * Print help information
 */
function printHelp() {
  console.log(`
共享行情服务 / Shared Market Data Service

使用方法 / Usage:
  node src/services/market-data-service.js [options]

选项 / Options:
  --exchanges <list>      交易所列表 (逗号分隔) / Exchange list (comma separated)
                          默认: binance,okx,bybit
  --symbols <list>        交易对列表 (逗号分隔) / Symbol list (comma separated)
                          默认: 订阅所有
  --trading-type <type>   交易类型 / Trading type
                          默认: swap
  --redis-host <host>     Redis 主机 / Redis host
                          默认: localhost
  --redis-port <port>     Redis 端口 / Redis port
                          默认: 6379
  -h, --help              显示帮助 / Show help

环境变量 / Environment Variables:
  REDIS_HOST              Redis 主机
  REDIS_PORT              Redis 端口
  REDIS_PASSWORD          Redis 密码
  REDIS_DB                Redis 数据库
  MARKET_DATA_EXCHANGES   交易所列表
  MARKET_DATA_SYMBOLS     交易对列表
  TRADING_TYPE            交易类型
  SUBSCRIBE_ALL           是否订阅所有交易对

示例 / Examples:
  # 使用默认配置启动
  node src/services/market-data-service.js

  # 指定交易所和交易对
  node src/services/market-data-service.js --exchanges binance,okx --symbols BTC/USDT,ETH/USDT

  # 使用环境变量
  MARKET_DATA_EXCHANGES=binance,okx REDIS_HOST=192.168.1.100 node src/services/market-data-service.js
`);
}

/**
 * 打印启动横幅
 * Print startup banner
 */
function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           共享行情服务 / Shared Market Data Service           ║
║                                                              ║
║  通过 Redis Pub/Sub 分发实时行情数据                          ║
║  Distributes real-time market data via Redis Pub/Sub         ║
╚══════════════════════════════════════════════════════════════╝
`);
}

/**
 * 主函数
 * Main function
 */
async function main() {
  // 打印横幅 / Print banner
  printBanner();

  // 解析命令行参数 / Parse command line arguments
  const config = parseArgs();

  console.log(`${LOG_PREFIX} 正在启动服务... / Starting service...`);
  console.log(`${LOG_PREFIX} 配置 / Config:`, JSON.stringify(config, null, 2));

  // 创建服务实例 / Create service instance
  const service = new MarketDataService(config);

  // 注册信号处理 / Register signal handlers
  const shutdown = async (signal) => {
    console.log(`\n${LOG_PREFIX} 收到 ${signal} 信号，正在关闭服务... / Received ${signal}, shutting down...`);
    try {
      await service.stop();
      console.log(`${LOG_PREFIX} 服务已安全关闭 / Service shutdown complete`);
      process.exit(0);
    } catch (error) {
      console.error(`${LOG_PREFIX} 关闭服务时出错 / Error during shutdown:`, error.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 处理未捕获的异常 / Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error(`${LOG_PREFIX} 未捕获的异常 / Uncaught exception:`, error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`${LOG_PREFIX} 未处理的 Promise 拒绝 / Unhandled rejection:`, reason);
  });

  // 监听服务事件 / Listen to service events
  service.on('started', () => {
    console.log(`${LOG_PREFIX} ✓ 服务启动成功 / Service started successfully`);
  });

  service.on('error', (error) => {
    console.error(`${LOG_PREFIX} 服务错误 / Service error:`, error.message);
  });

  service.on('reconnected', (exchange) => {
    console.log(`${LOG_PREFIX} 交易所重连 / Exchange reconnected: ${exchange}`);
  });

  // 启动服务 / Start service
  try {
    await service.start();

    // 定期打印状态 / Periodically print status
    setInterval(() => {
      const status = service.getStatus();
      console.log(`${LOG_PREFIX} 状态 / Status:`, {
        uptime: Math.round(status.uptime / 1000) + 's',
        tickers: status.stats.tickersPublished,
        depths: status.stats.depthsPublished,
        trades: status.stats.tradesPublished,
        errors: status.stats.errors,
      });
    }, 60000); // 每分钟 / Every minute

  } catch (error) {
    console.error(`${LOG_PREFIX} 启动失败 / Failed to start:`, error);
    process.exit(1);
  }
}

// 执行主函数 / Execute main function
main().catch((error) => {
  console.error(`${LOG_PREFIX} 致命错误 / Fatal error:`, error);
  process.exit(1);
});
