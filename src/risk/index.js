/**
 * 风控模块导出文件
 * Risk Module Export File
 *
 * 统一导出所有风控相关的类和工具
 * Unified export of all risk related classes and utilities
 */

// 导出风险管理器 / Export risk manager
export { RiskManager } from './RiskManager.js'; // 导出命名成员

// 导出仓位计算器 / Export position calculator
export { PositionCalculator } from './PositionCalculator.js'; // 导出命名成员

// ============================================
// 高级风控管理器导出
// Advanced Risk Manager Exports
// ============================================

// 导出高级风控管理器 / Export advanced risk manager
export { AdvancedRiskManager } from './manager.js'; // 导出命名成员

// 导出风控常量 / Export risk constants
export { // 导出命名成员
  RISK_LEVEL, // 执行语句
  RISK_ACTION, // 执行语句
  POSITION_SIDE, // 执行语句
  DEFAULT_CONFIG as RISK_DEFAULT_CONFIG, // 执行语句
} from './manager.js'; // 执行语句

// ============================================
// 组合风控管理器导出
// Portfolio Risk Manager Exports
// ============================================

// 导出组合风控管理器 / Export portfolio risk manager
export { // 导出命名成员
  PortfolioRiskManager, // 执行语句
  PORTFOLIO_RISK_LEVEL, // 执行语句
  RISK_ACTION as PORTFOLIO_RISK_ACTION, // 执行语句
  DEFAULT_CONFIG as PORTFOLIO_RISK_CONFIG, // 执行语句
} from './PortfolioRiskManager.js'; // 执行语句

// ============================================
// 黑天鹅保护器导出
// Black Swan Protector Exports
// ============================================

export { // 导出命名成员
  BlackSwanProtector, // 执行语句
  CIRCUIT_BREAKER_LEVEL, // 执行语句
  BLACK_SWAN_TYPE, // 执行语句
  DEFAULT_CONFIG as BLACK_SWAN_CONFIG, // 执行语句
} from './BlackSwanProtector.js'; // 执行语句

// ============================================
// 流动性风险监控器导出
// Liquidity Risk Monitor Exports
// ============================================

export { // 导出命名成员
  LiquidityRiskMonitor, // 执行语句
  LIQUIDITY_LEVEL, // 执行语句
  EXECUTION_STRATEGY, // 执行语句
  DEFAULT_CONFIG as LIQUIDITY_CONFIG, // 执行语句
} from './LiquidityRiskMonitor.js'; // 执行语句

// ============================================
// 跨账户风险汇总器导出
// Multi-Account Risk Aggregator Exports
// ============================================

export { // 导出命名成员
  MultiAccountRiskAggregator, // 执行语句
  ACCOUNT_STATUS, // 执行语句
  GLOBAL_RISK_LEVEL, // 执行语句
  DEFAULT_CONFIG as MULTI_ACCOUNT_CONFIG, // 执行语句
} from './MultiAccountRiskAggregator.js'; // 执行语句

// ============================================
// 统一风控系统导出
// Unified Risk System Exports
// ============================================

export { // 导出命名成员
  default as RiskSystem, // 执行语句
  SYSTEM_STATUS, // 执行语句
} from './RiskSystem.js'; // 执行语句

// ============================================
// 熔断器导出
// Circuit Breaker Exports
// ============================================

export { // 导出命名成员
  CircuitBreaker, // 执行语句
  CircuitBreakerError, // 执行语句
  CircuitBreakerManager, // 执行语句
  CircuitState, // 执行语句
  withCircuitBreaker, // 执行语句
  wrapWithCircuitBreaker, // 执行语句
  defaultManager as defaultCircuitBreakerManager, // 执行语句
} from './CircuitBreaker.js'; // 执行语句

// 默认导出风险管理器 / Default export risk manager
export { RiskManager as default } from './RiskManager.js'; // 导出命名成员
