/**
 * 资金管理模块导出文件
 * Capital Management Module Export File
 *
 * 统一导出所有资金管理相关类
 * Unified export of all capital management classes
 */

// 导出资金分配器 / Export capital allocator
export {
  CapitalAllocator,
  ALLOCATION_METHOD,
  REBALANCE_TRIGGER,
  DEFAULT_CONFIG as ALLOCATOR_CONFIG,
} from './CapitalAllocator.js';

// 默认导出 / Default export
export { CapitalAllocator as default } from './CapitalAllocator.js';
