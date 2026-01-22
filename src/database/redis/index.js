/**
 * Redis 存储模块导出
 * Redis Storage Module Exports
 *
 * @module src/database/redis
 */

export { RedisClient, getRedisClient, KEY_PREFIX } from './RedisClient.js'; // 导出命名成员
export { OrderStore, ORDER_STATUS } from './OrderStore.js'; // 导出命名成员
export { PositionStore, POSITION_STATUS, POSITION_SIDE } from './PositionStore.js'; // 导出命名成员
export { StrategyStore, STRATEGY_STATE, SIGNAL_TYPE } from './StrategyStore.js'; // 导出命名成员
export { ConfigStore } from './ConfigStore.js'; // 导出命名成员
export { RedisBackupManager, BACKUP_TYPE, BACKUP_STATUS } from './RedisBackupManager.js'; // 导出命名成员

// DB-012: 连接池管理 / Connection pool management
export { RedisConnectionPool, CONNECTION_STATE, DEFAULT_POOL_CONFIG } from './RedisConnectionPool.js'; // 导出命名成员

// DB-013: Sentinel 高可用 / Sentinel high availability
export { RedisSentinel, SENTINEL_STATE, DEFAULT_SENTINEL_CONFIG } from './RedisSentinel.js'; // 导出命名成员
