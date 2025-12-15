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

// 默认导出智能订单执行器 / Default export smart order executor
export { SmartOrderExecutor as default } from './orderExecutor.js';
