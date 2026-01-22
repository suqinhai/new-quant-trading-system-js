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

import { ExecutionAlphaEngine } from './ExecutionAlphaEngine.js'; // 导入模块 ./ExecutionAlphaEngine.js
import { OrderBookAnalyzer } from './OrderBookAnalyzer.js'; // 导入模块 ./OrderBookAnalyzer.js

// ============================================
// 核心引擎导出 / Core Engine Export
// ============================================

// 执行 Alpha 引擎（统一入口）/ Execution Alpha Engine (unified entry)
export { ExecutionAlphaEngine } from './ExecutionAlphaEngine.js'; // 导出命名成员
export { ExecutionAlphaEngine as default } from './ExecutionAlphaEngine.js'; // 导出命名成员

// 执行 Alpha 引擎常量 / Execution Alpha Engine constants
export { // 导出命名成员
  EXECUTION_STRATEGY, // 执行语句
  ORDER_SIZE_CLASS, // 执行语句
  DEFAULT_CONFIG as ENGINE_DEFAULT_CONFIG, // 执行语句
} from './ExecutionAlphaEngine.js'; // 执行语句

// ============================================
// 盘口分析器导出 / Order Book Analyzer Export
// ============================================

// 盘口厚度分析器 / Order book depth analyzer
export { OrderBookAnalyzer } from './OrderBookAnalyzer.js'; // 导出命名成员

// 盘口分析器常量 / Order book analyzer constants
export { // 导出命名成员
  LIQUIDITY_LEVEL, // 执行语句
  PRESSURE_DIRECTION, // 执行语句
  DEFAULT_CONFIG as ORDER_BOOK_CONFIG, // 执行语句
} from './OrderBookAnalyzer.js'; // 执行语句

// ============================================
// TWAP/VWAP 执行器导出 / TWAP/VWAP Executor Export
// ============================================

// TWAP/VWAP 执行器 / TWAP/VWAP executor
export { TWAPVWAPExecutor } from './TWAPVWAPExecutor.js'; // 导出命名成员

// 切片生成器 / Slice generator
export { SliceGenerator } from './TWAPVWAPExecutor.js'; // 导出命名成员

// TWAP/VWAP 常量 / TWAP/VWAP constants
export { // 导出命名成员
  ALGO_TYPE, // 执行语句
  EXECUTION_STATUS as TWAP_EXECUTION_STATUS, // 执行语句
  MARKET_CONDITION, // 执行语句
  VOLUME_CURVES, // 执行语句
  DEFAULT_CONFIG as TWAP_DEFAULT_CONFIG, // 执行语句
} from './TWAPVWAPExecutor.js'; // 执行语句

// ============================================
// 冰山单执行器导出 / Iceberg Executor Export
// ============================================

// 冰山单执行器 / Iceberg order executor
export { IcebergOrderExecutor } from './IcebergOrderExecutor.js'; // 导出命名成员

// 拆单计算器 / Split calculator
export { SplitCalculator } from './IcebergOrderExecutor.js'; // 导出命名成员

// 冰山单常量 / Iceberg constants
export { // 导出命名成员
  SPLIT_STRATEGY, // 执行语句
  DISPLAY_MODE, // 执行语句
  ICEBERG_STATUS, // 执行语句
  DEFAULT_CONFIG as ICEBERG_DEFAULT_CONFIG, // 执行语句
} from './IcebergOrderExecutor.js'; // 执行语句

// ============================================
// 滑点分析器导出 / Slippage Analyzer Export
// ============================================

// 滑点分析器 / Slippage analyzer
export { SlippageAnalyzer } from './SlippageAnalyzer.js'; // 导出命名成员

// 滑点分析器常量 / Slippage analyzer constants
export { // 导出命名成员
  SLIPPAGE_RISK, // 执行语句
  PERIOD_TYPE, // 执行语句
  KNOWN_HIGH_RISK_PERIODS, // 执行语句
  DEFAULT_CONFIG as SLIPPAGE_DEFAULT_CONFIG, // 执行语句
} from './SlippageAnalyzer.js'; // 执行语句

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
export function createExecutionAlphaEngine(config = {}) { // 导出函数 createExecutionAlphaEngine
  return new ExecutionAlphaEngine(config); // 返回结果
} // 结束代码块

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
export function quickAnalyze(orderBook, symbol, side, size) { // 导出函数 quickAnalyze
  const analyzer = new OrderBookAnalyzer(); // 定义常量 analyzer

  const depthAnalysis = analyzer.analyzeDepth(orderBook, symbol); // 定义常量 depthAnalysis
  const liquidityAssessment = analyzer.assessLiquidity(symbol, size, depthAnalysis); // 定义常量 liquidityAssessment
  const impactEstimation = analyzer.estimateImpactCost(symbol, side, size, orderBook); // 定义常量 impactEstimation

  return { // 返回结果
    depthAnalysis, // 执行语句
    liquidityAssessment, // 执行语句
    impactEstimation, // 执行语句
    recommendation: getQuickRecommendation(liquidityAssessment, impactEstimation), // 设置 recommendation 字段
  }; // 结束代码块
} // 结束代码块

/**
 * 获取快速建议
 * Get quick recommendation
 *
 * @param {Object} liquidityAssessment - 流动性评估 / Liquidity assessment
 * @param {Object} impactEstimation - 冲击估算 / Impact estimation
 * @returns {string} 建议 / Recommendation
 */
function getQuickRecommendation(liquidityAssessment, impactEstimation) { // 定义函数 getQuickRecommendation
  if (impactEstimation.impactLevel === 'extreme') { // 条件判断 impactEstimation.impactLevel === 'extreme'
    return 'ICEBERG: 冲击成本极高，强烈建议使用冰山单 / Extreme impact, strongly recommend iceberg'; // 返回结果
  } // 结束代码块

  if (impactEstimation.impactLevel === 'high' || // 条件判断 impactEstimation.impactLevel === 'high' ||
      liquidityAssessment.level === 'very_low') { // 赋值 liquidityAssessment.level
    return 'TWAP: 冲击成本较高，建议使用 TWAP 执行 / High impact, recommend TWAP execution'; // 返回结果
  } // 结束代码块

  if (liquidityAssessment.level === 'low') { // 条件判断 liquidityAssessment.level === 'low'
    return 'VWAP: 流动性较低，建议使用 VWAP 跟随市场节奏 / Low liquidity, recommend VWAP'; // 返回结果
  } // 结束代码块

  return 'DIRECT: 流动性充足，可直接执行 / Sufficient liquidity, direct execution OK'; // 返回结果
} // 结束代码块
