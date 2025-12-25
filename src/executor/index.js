/**
 * 订单执行模块导出文件
 * Executor Module Export File
 *
 * 统一导出所有订单执行相关的类和工具
 * Unified export of all executor related classes and utilities
 */

// ============================================
// 智能订单执行器导出
// Smart Order Executor Exports
// ============================================

// 导出智能订单执行器 / Export smart order executor
export { SmartOrderExecutor } from './orderExecutor.js';

// 为向后兼容创建别名 / Create alias for backward compatibility
export { SmartOrderExecutor as OrderExecutor } from './orderExecutor.js';

// 导出订单执行常量 / Export order execution constants
export {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  ERROR_TYPE,
  DEFAULT_CONFIG as EXECUTOR_DEFAULT_CONFIG,
} from './orderExecutor.js';

// 导出辅助类 / Export helper classes
export {
  AccountLockManager,
  RateLimitManager,
  NonceManager,
} from './orderExecutor.js';

// ============================================
// 执行质量监控器导出
// Execution Quality Monitor Exports
// ============================================

// 导出执行质量监控器 / Export execution quality monitor
export { ExecutionQualityMonitor } from './ExecutionQualityMonitor.js';

// 导出执行质量常量 / Export execution quality constants
export {
  EXECUTION_QUALITY,
  SLIPPAGE_TYPE,
  ORDER_STATUS as EXECUTION_ORDER_STATUS,
  DEFAULT_CONFIG as QUALITY_MONITOR_CONFIG,
} from './ExecutionQualityMonitor.js';

// ============================================
// 交易所故障切换导出
// Exchange Failover Exports
// ============================================

// 导出交易所故障切换管理器 / Export exchange failover manager
export { ExchangeFailover } from './ExchangeFailover.js';

// 导出故障切换常量 / Export failover constants
export {
  EXCHANGE_STATUS,
  FAILURE_TYPE,
  FAILOVER_REASON,
  DEFAULT_CONFIG as FAILOVER_CONFIG,
} from './ExchangeFailover.js';

// ============================================
// 网络分区处理器导出
// Network Partition Handler Exports
// ============================================

// 导出网络分区处理器 / Export network partition handler
export { NetworkPartitionHandler } from './NetworkPartitionHandler.js';

// 导出网络分区常量 / Export network partition constants
export {
  SYNC_STATUS,
  INCONSISTENCY_TYPE,
  REPAIR_ACTION,
  PARTITION_STATUS,
  DEFAULT_CONFIG as PARTITION_HANDLER_CONFIG,
} from './NetworkPartitionHandler.js';

// ============================================
// 执行 Alpha 模块导出
// Execution Alpha Module Exports
// ============================================

// 导出执行 Alpha 引擎 / Export Execution Alpha Engine
export { ExecutionAlphaEngine } from './executionAlpha/index.js';

// 导出盘口分析器 / Export Order Book Analyzer
export { OrderBookAnalyzer } from './executionAlpha/index.js';

// 导出 TWAP/VWAP 执行器 / Export TWAP/VWAP Executor
export { TWAPVWAPExecutor } from './executionAlpha/index.js';

// 导出冰山单执行器 / Export Iceberg Executor
export { IcebergOrderExecutor } from './executionAlpha/index.js';

// 导出滑点分析器 / Export Slippage Analyzer
export { SlippageAnalyzer } from './executionAlpha/index.js';

// 导出执行 Alpha 常量 / Export Execution Alpha constants
export {
  // 执行策略 / Execution strategies
  EXECUTION_STRATEGY,
  ORDER_SIZE_CLASS,

  // 盘口分析 / Order book analysis
  LIQUIDITY_LEVEL,
  PRESSURE_DIRECTION,

  // TWAP/VWAP
  ALGO_TYPE,
  MARKET_CONDITION,
  VOLUME_CURVES,

  // 冰山单 / Iceberg
  SPLIT_STRATEGY,
  DISPLAY_MODE,
  ICEBERG_STATUS,

  // 滑点分析 / Slippage analysis
  SLIPPAGE_RISK,
  PERIOD_TYPE,
  KNOWN_HIGH_RISK_PERIODS,
} from './executionAlpha/index.js';

// 导出便捷函数 / Export convenience functions
export {
  createExecutionAlphaEngine,
  quickAnalyze,
} from './executionAlpha/index.js';

// 默认导出智能订单执行器 / Default export smart order executor
export { SmartOrderExecutor as default } from './orderExecutor.js';
