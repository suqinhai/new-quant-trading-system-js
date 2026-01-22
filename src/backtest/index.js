/**
 * 回测模块导出文件
 * Backtest Module Export File
 *
 * 统一导出所有回测相关的类和工具
 * Unified export of all backtest related classes and utilities
 */

// 导出原有回测引擎 / Export original backtest engine
export { BacktestEngine } from './BacktestEngine.js'; // 导出命名成员

// 导出回测运行器 / Export backtest runner
export { BacktestRunner } from './runner.js'; // 导出命名成员

// ============================================
// 高性能事件驱动回测引擎导出
// High-Performance Event-Driven Backtest Engine Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  SIDE, // 执行语句
  ORDER_TYPE, // 执行语句
  ORDER_STATUS, // 执行语句
  EVENT_TYPE, // 执行语句
  POSITION_SIDE, // 执行语句
} from './engine.js'; // 执行语句

// 导出核心类 / Export core classes
export { // 导出命名成员
  BaseStrategy, // 执行语句
  BacktestEngine as EventDrivenBacktestEngine, // 执行语句
  Position, // 执行语句
  Account, // 执行语句
  OrderBook, // 执行语句
  MatchingEngine, // 执行语句
  ObjectPool, // 执行语句
} from './engine.js'; // 执行语句

// 默认导出回测引擎 / Default export backtest engine
export { BacktestEngine as default } from './BacktestEngine.js'; // 导出命名成员
