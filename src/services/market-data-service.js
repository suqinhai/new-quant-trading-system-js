#!/usr/bin/env node // 执行语句
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

import { MarketDataService } from './MarketDataService.js'; // 导入模块 ./MarketDataService.js

// 日志前缀 / Log prefix
const LOG_PREFIX = '[MarketDataServiceRunner]'; // 定义常量 LOG_PREFIX

/**
 * 解析命令行参数
 * Parse command line arguments
 *
 * @returns {Object} 配置对象 / Configuration object
 */
function parseArgs() { // 定义函数 parseArgs
  const args = process.argv.slice(2); // 定义常量 args
  const config = {}; // 定义常量 config

  for (let i = 0; i < args.length; i++) { // 循环 let i = 0; i < args.length; i++
    const arg = args[i]; // 定义常量 arg

    if (arg === '--exchanges' && args[i + 1]) { // 条件判断 arg === '--exchanges' && args[i + 1]
      config.exchanges = args[++i].split(','); // 赋值 config.exchanges
    } else if (arg === '--symbols' && args[i + 1]) { // 执行语句
      config.symbols = args[++i].split(','); // 赋值 config.symbols
    } else if (arg === '--trading-type' && args[i + 1]) { // 执行语句
      config.tradingType = args[++i]; // 赋值 config.tradingType
    } else if (arg === '--redis-host' && args[i + 1]) { // 执行语句
      config.redis = config.redis || {}; // 赋值 config.redis
      config.redis.host = args[++i]; // 赋值 config.redis.host
    } else if (arg === '--redis-port' && args[i + 1]) { // 执行语句
      config.redis = config.redis || {}; // 赋值 config.redis
      config.redis.port = parseInt(args[++i], 10); // 赋值 config.redis.port
    } else if (arg === '--help' || arg === '-h') { // 执行语句
      printHelp(); // 调用 printHelp
      process.exit(0); // 退出进程
    } // 结束代码块
  } // 结束代码块

  return config; // 返回结果
} // 结束代码块

/**
 * 打印帮助信息
 * Print help information
 */
function printHelp() { // 定义函数 printHelp
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
`); // 执行语句
} // 结束代码块

/**
 * 打印启动横幅
 * Print startup banner
 */
function printBanner() { // 定义函数 printBanner
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           共享行情服务 / Shared Market Data Service           ║
║                                                              ║
║  通过 Redis Pub/Sub 分发实时行情数据                          ║
║  Distributes real-time market data via Redis Pub/Sub         ║
╚══════════════════════════════════════════════════════════════╝
`); // 执行语句
} // 结束代码块

/**
 * 主函数
 * Main function
 */
async function main() { // 定义函数 main
  // 打印横幅 / Print banner
  printBanner(); // 调用 printBanner

  // 解析命令行参数 / Parse command line arguments
  const config = parseArgs(); // 定义常量 config

  console.log(`${LOG_PREFIX} 正在启动服务... / Starting service...`); // 控制台输出
  console.log(`${LOG_PREFIX} 配置 / Config:`, JSON.stringify(config, null, 2)); // 控制台输出

  // 创建服务实例 / Create service instance
  const service = new MarketDataService(config); // 定义常量 service

  // 注册信号处理 / Register signal handlers
  const shutdown = async (signal) => { // 定义函数 shutdown
    console.log(`\n${LOG_PREFIX} 收到 ${signal} 信号，正在关闭服务... / Received ${signal}, shutting down...`); // 控制台输出
    try { // 尝试执行
      await service.stop(); // 等待异步结果
      console.log(`${LOG_PREFIX} 服务已安全关闭 / Service shutdown complete`); // 控制台输出
      process.exit(0); // 退出进程
    } catch (error) { // 执行语句
      console.error(`${LOG_PREFIX} 关闭服务时出错 / Error during shutdown:`, error.message); // 控制台输出
      process.exit(1); // 退出进程
    } // 结束代码块
  }; // 结束代码块

  process.on('SIGINT', () => shutdown('SIGINT')); // 注册事件监听
  process.on('SIGTERM', () => shutdown('SIGTERM')); // 注册事件监听

  // 处理未捕获的异常 / Handle uncaught exceptions
  process.on('uncaughtException', (error) => { // 注册事件监听
    console.error(`${LOG_PREFIX} 未捕获的异常 / Uncaught exception:`, error); // 控制台输出
    shutdown('uncaughtException'); // 调用 shutdown
  }); // 结束代码块

  process.on('unhandledRejection', (reason, promise) => { // 注册事件监听
    console.error(`${LOG_PREFIX} 未处理的 Promise 拒绝 / Unhandled rejection:`, reason); // 控制台输出
  }); // 结束代码块

  // 监听服务事件 / Listen to service events
  service.on('started', () => { // 注册事件监听
    console.log(`${LOG_PREFIX} ✓ 服务启动成功 / Service started successfully`); // 控制台输出
  }); // 结束代码块

  service.on('error', (error) => { // 注册事件监听
    console.error(`${LOG_PREFIX} 服务错误 / Service error:`, error.message); // 控制台输出
  }); // 结束代码块

  service.on('reconnected', (exchange) => { // 注册事件监听
    console.log(`${LOG_PREFIX} 交易所重连 / Exchange reconnected: ${exchange}`); // 控制台输出
  }); // 结束代码块

  // 启动服务 / Start service
  try { // 尝试执行
    await service.start(); // 等待异步结果

    // 定期打印状态 / Periodically print status
    setInterval(() => { // 设置周期任务
      const status = service.getStatus(); // 定义常量 status
      console.log(`${LOG_PREFIX} 状态 / Status:`, { // 控制台输出
        uptime: Math.round(status.uptime / 1000) + 's', // 设置 uptime 字段
        tickers: status.stats.tickersPublished, // 设置 tickers 字段
        depths: status.stats.depthsPublished, // 设置 depths 字段
        trades: status.stats.tradesPublished, // 设置 trades 字段
        fundings: status.stats.fundingsPublished, // 设置 fundings 字段
        klines: status.stats.klinesPublished, // 设置 klines 字段
        errors: status.stats.errors, // 设置 errors 字段
      }); // 结束代码块
    }, 60000); // 每分钟 / Every minute

  } catch (error) { // 执行语句
    console.error(`${LOG_PREFIX} 启动失败 / Failed to start:`, error); // 控制台输出
    process.exit(1); // 退出进程
  } // 结束代码块
} // 结束代码块

// 执行主函数 / Execute main function
main().catch((error) => { // 调用 main
  console.error(`${LOG_PREFIX} 致命错误 / Fatal error:`, error); // 控制台输出
  process.exit(1); // 退出进程
}); // 结束代码块
