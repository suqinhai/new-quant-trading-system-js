/**
 * 策略模块导出文件
 * Strategies Module Export File
 *
 * 统一导出所有策略类
 * Unified export of all strategy classes
 */

// 导出基类 / Export base class
export { BaseStrategy } from './BaseStrategy.js';

// 导出各策略实现 / Export strategy implementations
export { SMAStrategy } from './SMAStrategy.js';
export { RSIStrategy } from './RSIStrategy.js';
export { BollingerBandsStrategy } from './BollingerBandsStrategy.js';
export { MACDStrategy } from './MACDStrategy.js';
export { GridStrategy } from './GridStrategy.js';
export { FundingArbStrategy } from './FundingArbStrategy.js';

// 波动率策略 / Volatility strategies
export { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js';
export { BollingerWidthStrategy } from './BollingerWidthStrategy.js';
export { VolatilityRegimeStrategy } from './VolatilityRegimeStrategy.js';

// 默认导出基类 / Default export base class
export { BaseStrategy as default } from './BaseStrategy.js';

/**
 * 策略注册表
 * Strategy Registry
 *
 * 用于通过名称获取策略类
 * Used to get strategy class by name
 */
export const StrategyRegistry = {
  // 策略映射 / Strategy mapping
  SMA: () => import('./SMAStrategy.js').then(m => m.SMAStrategy),
  RSI: () => import('./RSIStrategy.js').then(m => m.RSIStrategy),
  BollingerBands: () => import('./BollingerBandsStrategy.js').then(m => m.BollingerBandsStrategy),
  MACD: () => import('./MACDStrategy.js').then(m => m.MACDStrategy),
  Grid: () => import('./GridStrategy.js').then(m => m.GridStrategy),
  FundingArb: () => import('./FundingArbStrategy.js').then(m => m.FundingArbStrategy),

  // 波动率策略 / Volatility strategies
  ATRBreakout: () => import('./ATRBreakoutStrategy.js').then(m => m.ATRBreakoutStrategy),
  BollingerWidth: () => import('./BollingerWidthStrategy.js').then(m => m.BollingerWidthStrategy),
  VolatilityRegime: () => import('./VolatilityRegimeStrategy.js').then(m => m.VolatilityRegimeStrategy),

  /**
   * 获取策略类
   * Get strategy class
   * @param {string} name - 策略名称 / Strategy name
   * @returns {Promise<Class>} 策略类 / Strategy class
   */
  async get(name) {
    const loader = this[name];
    if (!loader) {
      throw new Error(`未知策略: ${name} / Unknown strategy: ${name}`);
    }
    return await loader();
  },

  /**
   * 获取所有可用策略名称
   * Get all available strategy names
   * @returns {Array<string>} 策略名称列表 / Strategy name list
   */
  getAvailableStrategies() {
    return Object.keys(this).filter(key => typeof this[key] === 'function' && key !== 'get' && key !== 'getAvailableStrategies');
  },
};
