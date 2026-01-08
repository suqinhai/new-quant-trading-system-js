/**
 * 服务模块导出
 * Service Module Exports
 *
 * 提供共享行情服务、订阅器和通知服务的统一导出
 * Provides unified exports for shared market data service, subscriber and notification service
 */

// 导出行情服务 / Export market data service
export { MarketDataService, createMarketDataService } from './MarketDataService.js';

// 导出行情订阅器 / Export market data subscriber
export { MarketDataSubscriber, createMarketDataSubscriber } from './MarketDataSubscriber.js';

// 导出通知服务 / Export notification service
export { NotificationService, createNotificationService } from './NotificationService.js';

// 导出通知客户端 / Export notification client
export {
  NotificationClient,
  createNotificationClient,
  MESSAGE_TYPE,
  MESSAGE_PRIORITY,
} from './NotificationClient.js';

/**
 * 检查共享行情服务是否可用
 * Check if shared market data service is available
 *
 * @param {Object} redisConfig - Redis 配置 / Redis configuration
 * @returns {Promise<boolean>} 是否可用 / Whether available
 */
export async function isSharedMarketDataAvailable(redisConfig = {}) {
  const { MarketDataSubscriber } = await import('./MarketDataSubscriber.js');

  const subscriber = new MarketDataSubscriber({ redis: redisConfig });

  try {
    await subscriber.connect();
    const isAlive = await subscriber.checkServiceStatus();
    await subscriber.disconnect();
    return isAlive;
  } catch (error) {
    return false;
  }
}

/**
 * 创建行情订阅器并自动连接
 * Create market data subscriber and auto connect
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {Promise<MarketDataSubscriber>} 订阅器实例 / Subscriber instance
 */
export async function createConnectedSubscriber(config = {}) {
  const { MarketDataSubscriber } = await import('./MarketDataSubscriber.js');

  const subscriber = new MarketDataSubscriber(config);
  await subscriber.connect();

  return subscriber;
}

/**
 * 检查共享通知服务是否可用
 * Check if shared notification service is available
 *
 * @param {Object} redisConfig - Redis 配置 / Redis configuration
 * @returns {Promise<boolean>} 是否可用 / Whether available
 */
export async function isSharedNotificationAvailable(redisConfig = {}) {
  const { NotificationClient } = await import('./NotificationClient.js');

  const client = new NotificationClient({ redis: redisConfig });

  try {
    await client.connect();
    const isAvailable = await client.isServiceAvailable();
    await client.disconnect();
    return isAvailable;
  } catch (error) {
    return false;
  }
}

/**
 * 创建通知客户端并自动连接
 * Create notification client and auto connect
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {Promise<NotificationClient>} 客户端实例 / Client instance
 */
export async function createConnectedNotificationClient(config = {}) {
  const { NotificationClient } = await import('./NotificationClient.js');

  const client = new NotificationClient(config);
  await client.connect();

  return client;
}
