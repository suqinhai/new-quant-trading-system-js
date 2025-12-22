/**
 * Redis 存储模块导出
 * Redis Storage Module Exports
 *
 * @module src/database/redis
 */

export { RedisClient, getRedisClient, KEY_PREFIX } from './RedisClient.js';
export { OrderStore, ORDER_STATUS } from './OrderStore.js';
export { PositionStore, POSITION_STATUS, POSITION_SIDE } from './PositionStore.js';
export { StrategyStore, STRATEGY_STATE, SIGNAL_TYPE } from './StrategyStore.js';
export { ConfigStore } from './ConfigStore.js';
export { RedisBackupManager, BACKUP_TYPE, BACKUP_STATUS } from './RedisBackupManager.js';

// DB-012: 连接池管理 / Connection pool management
export { RedisConnectionPool, CONNECTION_STATE, DEFAULT_POOL_CONFIG } from './RedisConnectionPool.js';

// DB-013: Sentinel 高可用 / Sentinel high availability
export { RedisSentinel, SENTINEL_STATE, DEFAULT_SENTINEL_CONFIG } from './RedisSentinel.js';
