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
export { SmartOrderExecutor } from './orderExecutor.js'; // 导出命名成员

// 为向后兼容创建别名 / Create alias for backward compatibility
export { SmartOrderExecutor as OrderExecutor } from './orderExecutor.js'; // 导出命名成员

// 导出订单执行常量 / Export order execution constants
export { // 导出命名成员
  SIDE, // 执行语句
  ORDER_TYPE, // 执行语句
  ORDER_STATUS, // 执行语句
  ERROR_TYPE, // 执行语句
  DEFAULT_CONFIG as EXECUTOR_DEFAULT_CONFIG, // 执行语句
} from './orderExecutor.js'; // 执行语句

// 导出辅助类 / Export helper classes
export { // 导出命名成员
  AccountLockManager, // 执行语句
  RateLimitManager, // 执行语句
  NonceManager, // 执行语句
} from './orderExecutor.js'; // 执行语句

// ============================================
// 执行质量监控器导出
// Execution Quality Monitor Exports
// ============================================

// 导出执行质量监控器 / Export execution quality monitor
export { ExecutionQualityMonitor } from './ExecutionQualityMonitor.js'; // 导出命名成员

// 导出执行质量常量 / Export execution quality constants
export { // 导出命名成员
  EXECUTION_QUALITY, // 执行语句
  SLIPPAGE_TYPE, // 执行语句
  ORDER_STATUS as EXECUTION_ORDER_STATUS, // 执行语句
  DEFAULT_CONFIG as QUALITY_MONITOR_CONFIG, // 执行语句
} from './ExecutionQualityMonitor.js'; // 执行语句

// ============================================
// 交易所故障切换导出
// Exchange Failover Exports
// ============================================

// 导出交易所故障切换管理器 / Export exchange failover manager
export { ExchangeFailover } from './ExchangeFailover.js'; // 导出命名成员

// 导出故障切换常量 / Export failover constants
export { // 导出命名成员
  EXCHANGE_STATUS, // 执行语句
  FAILURE_TYPE, // 执行语句
  FAILOVER_REASON, // 执行语句
  DEFAULT_CONFIG as FAILOVER_CONFIG, // 执行语句
} from './ExchangeFailover.js'; // 执行语句

// ============================================
// 网络分区处理器导出
// Network Partition Handler Exports
// ============================================

// 导出网络分区处理器 / Export network partition handler
export { NetworkPartitionHandler } from './NetworkPartitionHandler.js'; // 导出命名成员

// 导出网络分区常量 / Export network partition constants
export { // 导出命名成员
  SYNC_STATUS, // 执行语句
  INCONSISTENCY_TYPE, // 执行语句
  REPAIR_ACTION, // 执行语句
  PARTITION_STATUS, // 执行语句
  DEFAULT_CONFIG as PARTITION_HANDLER_CONFIG, // 执行语句
} from './NetworkPartitionHandler.js'; // 执行语句

// ============================================
// 执行 Alpha 模块导出
// Execution Alpha Module Exports
// ============================================

// 导出执行 Alpha 引擎 / Export Execution Alpha Engine
export { ExecutionAlphaEngine } from './executionAlpha/index.js'; // 导出命名成员

// 导出盘口分析器 / Export Order Book Analyzer
export { OrderBookAnalyzer } from './executionAlpha/index.js'; // 导出命名成员

// 导出 TWAP/VWAP 执行器 / Export TWAP/VWAP Executor
export { TWAPVWAPExecutor } from './executionAlpha/index.js'; // 导出命名成员

// 导出冰山单执行器 / Export Iceberg Executor
export { IcebergOrderExecutor } from './executionAlpha/index.js'; // 导出命名成员

// 导出滑点分析器 / Export Slippage Analyzer
export { SlippageAnalyzer } from './executionAlpha/index.js'; // 导出命名成员

// 导出执行 Alpha 常量 / Export Execution Alpha constants
export { // 导出命名成员
  // 执行策略 / Execution strategies
  EXECUTION_STRATEGY, // 执行语句
  ORDER_SIZE_CLASS, // 执行语句

  // 盘口分析 / Order book analysis
  LIQUIDITY_LEVEL, // 执行语句
  PRESSURE_DIRECTION, // 执行语句

  // TWAP/VWAP
  ALGO_TYPE, // 执行语句
  MARKET_CONDITION, // 执行语句
  VOLUME_CURVES, // 执行语句

  // 冰山单 / Iceberg
  SPLIT_STRATEGY, // 执行语句
  DISPLAY_MODE, // 执行语句
  ICEBERG_STATUS, // 执行语句

  // 滑点分析 / Slippage analysis
  SLIPPAGE_RISK, // 执行语句
  PERIOD_TYPE, // 执行语句
  KNOWN_HIGH_RISK_PERIODS, // 执行语句
} from './executionAlpha/index.js'; // 执行语句

// 导出便捷函数 / Export convenience functions
export { // 导出命名成员
  createExecutionAlphaEngine, // 执行语句
  quickAnalyze, // 执行语句
} from './executionAlpha/index.js'; // 执行语句

// 默认导出智能订单执行器 / Default export smart order executor
export { SmartOrderExecutor as default } from './orderExecutor.js'; // 导出命名成员
