/**
 * 优化模块导出文件
 * Optimization Module Export File
 *
 * 统一导出所有优化相关类
 * Unified export of all optimization classes
 *
 * @module src/optimization
 */

// 参数网格搜索 / Parameter Grid Search
export {
  GridSearch,
  OptimizationTarget,
  DEFAULT_GRID_SEARCH_CONFIG,
} from './GridSearch.js';

// Walk-Forward 分析 / Walk-Forward Analysis
export {
  WalkForwardAnalysis,
  WalkForwardType,
  DEFAULT_WF_CONFIG,
} from './WalkForwardAnalysis.js';

// 蒙特卡洛模拟 / Monte Carlo Simulation
export {
  MonteCarloSimulation,
  SimulationType,
  DEFAULT_MC_CONFIG,
} from './MonteCarloSimulation.js';

// 默认导出 / Default export
export { GridSearch as default } from './GridSearch.js';
