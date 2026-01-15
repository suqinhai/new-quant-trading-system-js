/**
 * 执行 Alpha 模块导出文件
 * Execution Alpha Module Export File
 *
 * 执行 Alpha 通过优化订单执行来获取额外收益
 * Execution Alpha captures additional returns by optimizing order execution
 *
 * 核心功能 / Core Features:
 * 1. TWAP/VWAP 动态执行 / TWAP/VWAP dynamic execution
 * 2. 冰山单/智能拆单 / Iceberg/smart order splitting
 * 3. 高滑点时段规避 / High slippage period avoidance
 * 4. 盘口厚度感知 / Order book depth awareness
 * 5. 自适应执行策略 / Adaptive execution strategy
 */

import { ExecutionAlphaEngine } from './ExecutionAlphaEngine.js';
import { OrderBookAnalyzer } from './OrderBookAnalyzer.js';

// ============================================
// 核心引擎导出 / Core Engine Export
// ============================================

// 执行 Alpha 引擎（统一入口）/ Execution Alpha Engine (unified entry)
export { ExecutionAlphaEngine } from './ExecutionAlphaEngine.js';
export { ExecutionAlphaEngine as default } from './ExecutionAlphaEngine.js';

// 执行 Alpha 引擎常量 / Execution Alpha Engine constants
export {
  EXECUTION_STRATEGY,
  ORDER_SIZE_CLASS,
  DEFAULT_CONFIG as ENGINE_DEFAULT_CONFIG,
} from './ExecutionAlphaEngine.js';

// ============================================
// 盘口分析器导出 / Order Book Analyzer Export
// ============================================

// 盘口厚度分析器 / Order book depth analyzer
export { OrderBookAnalyzer } from './OrderBookAnalyzer.js';

// 盘口分析器常量 / Order book analyzer constants
export {
  LIQUIDITY_LEVEL,
  PRESSURE_DIRECTION,
  DEFAULT_CONFIG as ORDER_BOOK_CONFIG,
} from './OrderBookAnalyzer.js';

// ============================================
// TWAP/VWAP 执行器导出 / TWAP/VWAP Executor Export
// ============================================

// TWAP/VWAP 执行器 / TWAP/VWAP executor
export { TWAPVWAPExecutor } from './TWAPVWAPExecutor.js';

// 切片生成器 / Slice generator
export { SliceGenerator } from './TWAPVWAPExecutor.js';

// TWAP/VWAP 常量 / TWAP/VWAP constants
export {
  ALGO_TYPE,
  EXECUTION_STATUS as TWAP_EXECUTION_STATUS,
  MARKET_CONDITION,
  VOLUME_CURVES,
  DEFAULT_CONFIG as TWAP_DEFAULT_CONFIG,
} from './TWAPVWAPExecutor.js';

// ============================================
// 冰山单执行器导出 / Iceberg Executor Export
// ============================================

// 冰山单执行器 / Iceberg order executor
export { IcebergOrderExecutor } from './IcebergOrderExecutor.js';

// 拆单计算器 / Split calculator
export { SplitCalculator } from './IcebergOrderExecutor.js';

// 冰山单常量 / Iceberg constants
export {
  SPLIT_STRATEGY,
  DISPLAY_MODE,
  ICEBERG_STATUS,
  DEFAULT_CONFIG as ICEBERG_DEFAULT_CONFIG,
} from './IcebergOrderExecutor.js';

// ============================================
// 滑点分析器导出 / Slippage Analyzer Export
// ============================================

// 滑点分析器 / Slippage analyzer
export { SlippageAnalyzer } from './SlippageAnalyzer.js';

// 滑点分析器常量 / Slippage analyzer constants
export {
  SLIPPAGE_RISK,
  PERIOD_TYPE,
  KNOWN_HIGH_RISK_PERIODS,
  DEFAULT_CONFIG as SLIPPAGE_DEFAULT_CONFIG,
} from './SlippageAnalyzer.js';

// ============================================
// 便捷函数 / Convenience Functions
// ============================================

/**
 * 创建执行 Alpha 引擎实例
 * Create Execution Alpha Engine instance
 *
 * @param {Object} config - 配置对象 / Configuration object
 * @returns {ExecutionAlphaEngine} 引擎实例 / Engine instance
 */
export function createExecutionAlphaEngine(config = {}) {
  return new ExecutionAlphaEngine(config);
}

/**
 * 快速分析订单执行可行性
 * Quick analyze order execution feasibility
 *
 * @param {Object} orderBook - 盘口数据 / Order book data
 * @param {string} symbol - 交易对 / Symbol
 * @param {string} side - 买卖方向 / Side
 * @param {number} size - 订单大小 / Order size
 * @returns {Object} 分析结果 / Analysis result
 */
export function quickAnalyze(orderBook, symbol, side, size) {
  const analyzer = new OrderBookAnalyzer();

  const depthAnalysis = analyzer.analyzeDepth(orderBook, symbol);
  const liquidityAssessment = analyzer.assessLiquidity(symbol, size, depthAnalysis);
  const impactEstimation = analyzer.estimateImpactCost(symbol, side, size, orderBook);

  return {
    depthAnalysis,
    liquidityAssessment,
    impactEstimation,
    recommendation: getQuickRecommendation(liquidityAssessment, impactEstimation),
  };
}

/**
 * 获取快速建议
 * Get quick recommendation
 *
 * @param {Object} liquidityAssessment - 流动性评估 / Liquidity assessment
 * @param {Object} impactEstimation - 冲击估算 / Impact estimation
 * @returns {string} 建议 / Recommendation
 */
function getQuickRecommendation(liquidityAssessment, impactEstimation) {
  if (impactEstimation.impactLevel === 'extreme') {
    return 'ICEBERG: 冲击成本极高，强烈建议使用冰山单 / Extreme impact, strongly recommend iceberg';
  }

  if (impactEstimation.impactLevel === 'high' ||
      liquidityAssessment.level === 'very_low') {
    return 'TWAP: 冲击成本较高，建议使用 TWAP 执行 / High impact, recommend TWAP execution';
  }

  if (liquidityAssessment.level === 'low') {
    return 'VWAP: 流动性较低，建议使用 VWAP 跟随市场节奏 / Low liquidity, recommend VWAP';
  }

  return 'DIRECT: 流动性充足，可直接执行 / Sufficient liquidity, direct execution OK';
}
