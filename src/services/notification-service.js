#!/usr/bin/env node
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

import { NotificationService } from './NotificationService.js';

// 服务实例 / Service instance
let service = null;

/**
 * 启动服务
 * Start service
 */
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        共享通知服务 / Shared Notification Service            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // 打印配置信息 / Print configuration
  console.log('[NotificationService] 配置信息 / Configuration:');
  console.log(`  Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
  console.log(`  Telegram Enabled: ${process.env.TELEGRAM_ENABLED !== 'false'}`);
  console.log(`  Telegram Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '***' + process.env.TELEGRAM_BOT_TOKEN.slice(-4) : '未配置/Not configured'}`);
  console.log(`  Telegram Chat ID: ${process.env.TELEGRAM_CHAT_ID || '未配置/Not configured'}`);
  console.log('');

  // 创建服务实例 / Create service instance
  service = new NotificationService({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || null,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
      enabled: process.env.TELEGRAM_ENABLED !== 'false',
    },
    rateLimit: {
      maxMessagesPerSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND || '1', 10),
      maxMessagesPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10),
      maxQueueLength: parseInt(process.env.MAX_QUEUE_LENGTH || '100', 10),
    },
  });

  // 监听事件 / Listen to events
  service.on('started', () => {
    console.log('[NotificationService] 服务已启动，等待通知请求... / Service started, waiting for notification requests...');
    console.log('[NotificationService] 按 Ctrl+C 停止服务 / Press Ctrl+C to stop');
    console.log('');
  });

  service.on('stopped', () => {
    console.log('[NotificationService] 服务已停止 / Service stopped');
  });

  // 启动服务 / Start service
  try {
    await service.start();
  } catch (error) {
    console.error('[NotificationService] 启动失败 / Start failed:', error.message);
    process.exit(1);
  }
}

/**
 * 优雅停止
 * Graceful shutdown
 */
async function shutdown(signal) {
  console.log('');
  console.log(`[NotificationService] 收到 ${signal} 信号，正在停止... / Received ${signal}, shutting down...`);

  if (service) {
    try {
      await service.stop();
    } catch (error) {
      console.error('[NotificationService] 停止时出错 / Error during shutdown:', error.message);
    }
  }

  console.log('[NotificationService] 再见！/ Goodbye!');
  process.exit(0);
}

// 注册信号处理 / Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 处理未捕获的异常 / Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[NotificationService] 未捕获的异常 / Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[NotificationService] 未处理的 Promise 拒绝 / Unhandled rejection:', reason);
});

// 启动服务 / Start service
start().catch((error) => {
  console.error('[NotificationService] 启动错误 / Start error:', error);
  process.exit(1);
});
