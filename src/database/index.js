/**
 * 数据库模块导出
 * Database Module Exports
 *
 * @module src/database
 */

// SQLite 数据库管理器 / SQLite Database Manager
export {
  DatabaseManager,
  getDatabase,
} from './DatabaseManager.js';

export { TradeRepository } from './TradeRepository.js';

export { BackupManager } from './BackupManager.js';

// Redis 数据库管理器 / Redis Database Manager
export {
  RedisDatabaseManager,
  getRedisDatabase,
} from './RedisDatabaseManager.js';

// Redis 存储层 / Redis Stores
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

// ClickHouse 数据库管理器 / ClickHouse Database Manager
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
