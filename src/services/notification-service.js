#!/usr/bin/env node // 执行语句
/**
 * 共享通知服务入口
 * Shared Notification Service Entry Point
 *
 * 作为独立进程运行，统一处理所有策略容器的 Telegram 通知
 * Runs as independent process, handles Telegram notifications from all strategy containers
 *
 * 使用方法 / Usage:
 *   node src/services/notification-service.js
 *
 * 环境变量 / Environment Variables:
 *   REDIS_HOST          - Redis 主机 (default: localhost)
 *   REDIS_PORT          - Redis 端口 (default: 6379)
 *   REDIS_PASSWORD      - Redis 密码 (optional)
 *   TELEGRAM_BOT_TOKEN  - Telegram Bot Token
 *   TELEGRAM_CHAT_ID    - Telegram Chat ID
 *   TELEGRAM_ENABLED    - 是否启用 Telegram (default: true)
 *   MASTER_KEY          - 加密主密钥 (用于解密加密的 API 密钥)
 */

import { NotificationService } from './NotificationService.js'; // 导入模块 ./NotificationService.js

// 服务实例 / Service instance
let service = null; // 定义变量 service

/**
 * 启动服务
 * Start service
 */
async function start() { // 定义函数 start
  console.log(''); // 控制台输出
  console.log('╔══════════════════════════════════════════════════════════════╗'); // 控制台输出
  console.log('║        共享通知服务 / Shared Notification Service            ║'); // 控制台输出
  console.log('╚══════════════════════════════════════════════════════════════╝'); // 控制台输出
  console.log(''); // 控制台输出

  // 打印配置信息 / Print configuration
  console.log('[NotificationService] 配置信息 / Configuration:'); // 控制台输出
  console.log(`  Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`); // 读取环境变量 REDIS_HOST
  console.log(`  Telegram Enabled: ${process.env.TELEGRAM_ENABLED !== 'false'}`); // 读取环境变量 TELEGRAM_ENABLED
  console.log(`  Telegram Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '***' + process.env.TELEGRAM_BOT_TOKEN.slice(-4) : '未配置/Not configured'}`); // 读取环境变量 TELEGRAM_BOT_TOKEN
  console.log(`  Telegram Chat ID: ${process.env.TELEGRAM_CHAT_ID || '未配置/Not configured'}`); // 读取环境变量 TELEGRAM_CHAT_ID
  console.log(''); // 控制台输出

  // 创建服务实例 / Create service instance
  service = new NotificationService({ // 赋值 service
    redis: { // 设置 redis 字段
      host: process.env.REDIS_HOST || 'localhost', // 读取环境变量 REDIS_HOST
      port: parseInt(process.env.REDIS_PORT || '6379', 10), // 读取环境变量 REDIS_PORT
      password: process.env.REDIS_PASSWORD || null, // 读取环境变量 REDIS_PASSWORD
      db: parseInt(process.env.REDIS_DB || '0', 10), // 读取环境变量 REDIS_DB
    }, // 结束代码块
    telegram: { // 设置 telegram 字段
      botToken: process.env.TELEGRAM_BOT_TOKEN || '', // 读取环境变量 TELEGRAM_BOT_TOKEN
      chatId: process.env.TELEGRAM_CHAT_ID || '', // 读取环境变量 TELEGRAM_CHAT_ID
      enabled: process.env.TELEGRAM_ENABLED !== 'false', // 读取环境变量 TELEGRAM_ENABLED
    }, // 结束代码块
    rateLimit: { // 设置 rateLimit 字段
      maxMessagesPerSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND || '1', 10), // 读取环境变量 RATE_LIMIT_PER_SECOND
      maxMessagesPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10), // 读取环境变量 RATE_LIMIT_PER_MINUTE
      maxQueueLength: parseInt(process.env.MAX_QUEUE_LENGTH || '100', 10), // 读取环境变量 MAX_QUEUE_LENGTH
    }, // 结束代码块
  }); // 结束代码块

  // 监听事件 / Listen to events
  service.on('started', () => { // 注册事件监听
    console.log('[NotificationService] 服务已启动，等待通知请求... / Service started, waiting for notification requests...'); // 控制台输出
    console.log('[NotificationService] 按 Ctrl+C 停止服务 / Press Ctrl+C to stop'); // 控制台输出
    console.log(''); // 控制台输出
  }); // 结束代码块

  service.on('stopped', () => { // 注册事件监听
    console.log('[NotificationService] 服务已停止 / Service stopped'); // 控制台输出
  }); // 结束代码块

  // 启动服务 / Start service
  try { // 尝试执行
    await service.start(); // 等待异步结果
  } catch (error) { // 执行语句
    console.error('[NotificationService] 启动失败 / Start failed:', error.message); // 控制台输出
    process.exit(1); // 退出进程
  } // 结束代码块
} // 结束代码块

/**
 * 优雅停止
 * Graceful shutdown
 */
async function shutdown(signal) { // 定义函数 shutdown
  console.log(''); // 控制台输出
  console.log(`[NotificationService] 收到 ${signal} 信号，正在停止... / Received ${signal}, shutting down...`); // 控制台输出

  if (service) { // 条件判断 service
    try { // 尝试执行
      await service.stop(); // 等待异步结果
    } catch (error) { // 执行语句
      console.error('[NotificationService] 停止时出错 / Error during shutdown:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  console.log('[NotificationService] 再见！/ Goodbye!'); // 控制台输出
  process.exit(0); // 退出进程
} // 结束代码块

// 注册信号处理 / Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT')); // 注册事件监听
process.on('SIGTERM', () => shutdown('SIGTERM')); // 注册事件监听

// 处理未捕获的异常 / Handle uncaught exceptions
process.on('uncaughtException', (error) => { // 注册事件监听
  console.error('[NotificationService] 未捕获的异常 / Uncaught exception:', error); // 控制台输出
  shutdown('uncaughtException'); // 调用 shutdown
}); // 结束代码块

process.on('unhandledRejection', (reason, promise) => { // 注册事件监听
  console.error('[NotificationService] 未处理的 Promise 拒绝 / Unhandled rejection:', reason); // 控制台输出
}); // 结束代码块

// 启动服务 / Start service
start().catch((error) => { // 调用 start
  console.error('[NotificationService] 启动错误 / Start error:', error); // 控制台输出
  process.exit(1); // 退出进程
}); // 结束代码块
