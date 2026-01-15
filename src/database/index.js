/**
 * Database Module Exports
 *
 * @module src/database
 */

// Redis Database Manager
export {
  RedisDatabaseManager,
  getRedisDatabase,
} from './RedisDatabaseManager.js';

// Redis Stores
export {
  RedisClient,
  getRedisClient,
  KEY_PREFIX,
  OrderStore,
  ORDER_STATUS,
  PositionStore,
  POSITION_STATUS,
  POSITION_SIDE,
  StrategyStore,
  STRATEGY_STATE,
  SIGNAL_TYPE,
  ConfigStore,
  RedisBackupManager,
  BACKUP_TYPE,
  BACKUP_STATUS,
} from './redis/index.js';

// ClickHouse Database Manager
export {
  ClickHouseClient,
  getClickHouseClient,
  OrderArchiver,
  ARCHIVABLE_STATUSES,
  AuditLogWriter,
  LOG_LEVEL,
  TradeWriter,
  ArchiveScheduler,
} from './clickhouse/index.js';