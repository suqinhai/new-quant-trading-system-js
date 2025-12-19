/**
 * 风控模块导出文件
 * Risk Module Export File
 *
 * 统一导出所有风控相关的类和工具
 * Unified export of all risk related classes and utilities
 */

// 导出风险管理器 / Export risk manager
export { RiskManager } from './RiskManager.js';

// 导出仓位计算器 / Export position calculator
export { PositionCalculator } from './PositionCalculator.js';

// ============================================
// 高级风控管理器导出
// Advanced Risk Manager Exports
// ============================================

// 导出高级风控管理器 / Export advanced risk manager
export { AdvancedRiskManager } from './manager.js';

// 导出风控常量 / Export risk constants
export {
  RISK_LEVEL,
  RISK_ACTION,
  POSITION_SIDE,
  DEFAULT_CONFIG as RISK_DEFAULT_CONFIG,
} from './manager.js';

// ============================================
// 组合风控管理器导出
// Portfolio Risk Manager Exports
// ============================================

// 导出组合风控管理器 / Export portfolio risk manager
export {
  PortfolioRiskManager,
  PORTFOLIO_RISK_LEVEL,
  RISK_ACTION as PORTFOLIO_RISK_ACTION,
  DEFAULT_CONFIG as PORTFOLIO_RISK_CONFIG,
} from './PortfolioRiskManager.js';

// ============================================
// 黑天鹅保护器导出
// Black Swan Protector Exports
// ============================================

export {
  BlackSwanProtector,
  CIRCUIT_BREAKER_LEVEL,
  BLACK_SWAN_TYPE,
  DEFAULT_CONFIG as BLACK_SWAN_CONFIG,
} from './BlackSwanProtector.js';

// ============================================
// 流动性风险监控器导出
// Liquidity Risk Monitor Exports
// ============================================

export {
  LiquidityRiskMonitor,
  LIQUIDITY_LEVEL,
  EXECUTION_STRATEGY,
  DEFAULT_CONFIG as LIQUIDITY_CONFIG,
} from './LiquidityRiskMonitor.js';

// ============================================
// 跨账户风险汇总器导出
// Multi-Account Risk Aggregator Exports
// ============================================

export {
  MultiAccountRiskAggregator,
  ACCOUNT_STATUS,
  GLOBAL_RISK_LEVEL,
  DEFAULT_CONFIG as MULTI_ACCOUNT_CONFIG,
} from './MultiAccountRiskAggregator.js';

// ============================================
// 统一风控系统导出
// Unified Risk System Exports
// ============================================

export {
  default as RiskSystem,
  SYSTEM_STATUS,
} from './RiskSystem.js';

// 默认导出风险管理器 / Default export risk manager
export { RiskManager as default } from './RiskManager.js';
