/**
 * 回测模块导出文件
 * Backtest Module Export File
 *
 * 统一导出所有回测相关的类和工具
 * Unified export of all backtest related classes and utilities
 */

// 导出原有回测引擎 / Export original backtest engine
export { BacktestEngine } from './BacktestEngine.js';

// 导出回测运行器 / Export backtest runner
export { BacktestRunner } from './runner.js';

// ============================================
// 高性能事件驱动回测引擎导出
// High-Performance Event-Driven Backtest Engine Exports
// ============================================

// 导出常量 / Export constants
export {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  EVENT_TYPE,
  POSITION_SIDE,
} from './engine.js';

// 导出核心类 / Export core classes
export {
  BaseStrategy,
  BacktestEngine as EventDrivenBacktestEngine,
  Position,
  Account,
  OrderBook,
  MatchingEngine,
  ObjectPool,
} from './engine.js';

// 默认导出回测引擎 / Default export backtest engine
export { BacktestEngine as default } from './BacktestEngine.js';
