/**
 * 服务模块导出
 * Service Module Exports
 *
 * 提供共享行情服务、订阅器和通知服务的统一导出
 * Provides unified exports for shared market data service, subscriber and notification service
 */

// 导出行情服务 / Export market data service
export { MarketDataService, createMarketDataService } from './MarketDataService.js'; // 导出命名成员

// 导出行情订阅器 / Export market data subscriber
export { MarketDataSubscriber, createMarketDataSubscriber } from './MarketDataSubscriber.js'; // 导出命名成员

// 导出通知服务 / Export notification service
export { NotificationService, createNotificationService } from './NotificationService.js'; // 导出命名成员

// 导出通知客户端 / Export notification client
export { // 导出命名成员
  NotificationClient, // 执行语句
  createNotificationClient, // 执行语句
  MESSAGE_TYPE, // 执行语句
  MESSAGE_PRIORITY, // 执行语句
} from './NotificationClient.js'; // 执行语句

/**
 * 检查共享行情服务是否可用
 * Check if shared market data service is available
 *
 * @param {Object} redisConfig - Redis 配置 / Redis configuration
 * @returns {Promise<boolean>} 是否可用 / Whether available
 */
export async function isSharedMarketDataAvailable(redisConfig = {}) { // 导出函数 isSharedMarketDataAvailable
  const { MarketDataSubscriber } = await import('./MarketDataSubscriber.js'); // 解构赋值

  const subscriber = new MarketDataSubscriber({ redis: redisConfig }); // 定义常量 subscriber

  try { // 尝试执行
    await subscriber.connect(); // 等待异步结果
    const isAlive = await subscriber.checkServiceStatus(); // 定义常量 isAlive
    await subscriber.disconnect(); // 等待异步结果
    return isAlive; // 返回结果
  } catch (error) { // 执行语句
    return false; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 创建行情订阅器并自动连接
 * Create market data subscriber and auto connect
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {Promise<MarketDataSubscriber>} 订阅器实例 / Subscriber instance
 */
export async function createConnectedSubscriber(config = {}) { // 导出函数 createConnectedSubscriber
  const { MarketDataSubscriber } = await import('./MarketDataSubscriber.js'); // 解构赋值

  const subscriber = new MarketDataSubscriber(config); // 定义常量 subscriber
  await subscriber.connect(); // 等待异步结果

  return subscriber; // 返回结果
} // 结束代码块

/**
 * 检查共享通知服务是否可用
 * Check if shared notification service is available
 *
 * @param {Object} redisConfig - Redis 配置 / Redis configuration
 * @returns {Promise<boolean>} 是否可用 / Whether available
 */
export async function isSharedNotificationAvailable(redisConfig = {}) { // 导出函数 isSharedNotificationAvailable
  const { NotificationClient } = await import('./NotificationClient.js'); // 解构赋值

  const client = new NotificationClient({ redis: redisConfig }); // 定义常量 client

  try { // 尝试执行
    await client.connect(); // 等待异步结果
    const isAvailable = await client.isServiceAvailable(); // 定义常量 isAvailable
    await client.disconnect(); // 等待异步结果
    return isAvailable; // 返回结果
  } catch (error) { // 执行语句
    return false; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 创建通知客户端并自动连接
 * Create notification client and auto connect
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {Promise<NotificationClient>} 客户端实例 / Client instance
 */
export async function createConnectedNotificationClient(config = {}) { // 导出函数 createConnectedNotificationClient
  const { NotificationClient } = await import('./NotificationClient.js'); // 解构赋值

  const client = new NotificationClient(config); // 定义常量 client
  await client.connect(); // 等待异步结果

  return client; // 返回结果
} // 结束代码块
