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

// 默认导出风险管理器 / Default export risk manager
export { RiskManager as default } from './RiskManager.js';
