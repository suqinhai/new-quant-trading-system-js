/**
 * 资金管理模块导出文件
 * Capital Management Module Export File
 *
 * 统一导出所有资金管理相关类
 * Unified export of all capital management classes
 */

// 导出资金分配器 / Export capital allocator
export { // 导出命名成员
  CapitalAllocator, // 执行语句
  ALLOCATION_METHOD, // 执行语句
  REBALANCE_TRIGGER, // 执行语句
  DEFAULT_CONFIG as ALLOCATOR_CONFIG, // 执行语句
} from './CapitalAllocator.js'; // 执行语句

// 默认导出 / Default export
export { CapitalAllocator as default } from './CapitalAllocator.js'; // 导出命名成员
