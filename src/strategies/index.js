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

// Regime 切换策略 / Regime switching strategy
export { RegimeSwitchingStrategy, MarketRegime, RegimeEvent } from './RegimeSwitchingStrategy.js';

// 订单流策略 / Order flow strategy
export { OrderFlowStrategy } from './OrderFlowStrategy.js';

// 多周期共振策略 / Multi-timeframe resonance strategy
export { MultiTimeframeStrategy } from './MultiTimeframeStrategy.js';

// 加权组合策略 / Weighted combo strategy
export { WeightedComboStrategy } from './WeightedComboStrategy.js';
export { SignalWeightingSystem, StrategyStatus } from './SignalWeightingSystem.js';

// ============================================
// 横截面策略 (多币种) / Cross-Sectional Strategies (Multi-Asset)
// ============================================

// 横截面策略基类 / Cross-sectional strategy base class
export {
  CrossSectionalStrategy,
  AssetDataManager,
  PortfolioManager,
  CROSS_SECTIONAL_TYPES,
  RANK_DIRECTION,
  POSITION_TYPE,
} from './CrossSectionalStrategy.js';

// 动量排名策略 / Momentum rank strategy
export {
  MomentumRankStrategy,
  MOMENTUM_METRICS,
} from './MomentumRankStrategy.js';

// 强弱轮动策略 / Rotation strategy
export {
  RotationStrategy,
  STRENGTH_METRICS,
  ROTATION_TRIGGERS,
} from './RotationStrategy.js';

// 资金费率极值策略 / Funding rate extreme strategy
export {
  FundingRateExtremeStrategy,
  FundingRateDataManager,
  FUNDING_FREQUENCY,
  EXTREME_DETECTION,
} from './FundingRateExtremeStrategy.js';

// 跨交易所价差策略 / Cross-exchange spread strategy
export {
  CrossExchangeSpreadStrategy,
  CrossExchangePriceManager,
  ArbitragePositionManager,
  SUPPORTED_EXCHANGES,
  SPREAD_TYPES,
} from './CrossExchangeSpreadStrategy.js';

// ============================================
// 统计套利策略 / Statistical Arbitrage Strategies
// ============================================

// 统计套利策略 / Statistical arbitrage strategy
export {
  StatisticalArbitrageStrategy,
  PriceSeriesStore,
  StatisticalCalculator,
  PairManager,
  SpreadCalculator,
  STAT_ARB_TYPE,
  PAIR_STATUS,
  SIGNAL_TYPE,
  STAT_ARB_DEFAULT_CONFIG,
} from './StatisticalArbitrageStrategy.js';

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

  // Regime 切换策略 / Regime switching strategy
  RegimeSwitching: () => import('./RegimeSwitchingStrategy.js').then(m => m.RegimeSwitchingStrategy),

  // 订单流策略 / Order flow strategy
  OrderFlow: () => import('./OrderFlowStrategy.js').then(m => m.OrderFlowStrategy),

  // 多周期共振策略 / Multi-timeframe resonance strategy
  MultiTimeframe: () => import('./MultiTimeframeStrategy.js').then(m => m.MultiTimeframeStrategy),
  MTF: () => import('./MultiTimeframeStrategy.js').then(m => m.MultiTimeframeStrategy),  // 别名

  // 加权组合策略 / Weighted combo strategy
  WeightedCombo: () => import('./WeightedComboStrategy.js').then(m => m.WeightedComboStrategy),
  Combo: () => import('./WeightedComboStrategy.js').then(m => m.WeightedComboStrategy),  // 别名

  // ============================================
  // 横截面策略 / Cross-Sectional Strategies
  // ============================================

  // 横截面策略基类 / Cross-sectional base
  CrossSectional: () => import('./CrossSectionalStrategy.js').then(m => m.CrossSectionalStrategy),

  // 动量排名策略 / Momentum rank strategy
  MomentumRank: () => import('./MomentumRankStrategy.js').then(m => m.MomentumRankStrategy),
  Momentum: () => import('./MomentumRankStrategy.js').then(m => m.MomentumRankStrategy),  // 别名

  // 强弱轮动策略 / Rotation strategy
  Rotation: () => import('./RotationStrategy.js').then(m => m.RotationStrategy),
  TopBottom: () => import('./RotationStrategy.js').then(m => m.RotationStrategy),  // 别名

  // 资金费率极值策略 / Funding rate extreme strategy
  FundingRateExtreme: () => import('./FundingRateExtremeStrategy.js').then(m => m.FundingRateExtremeStrategy),
  FundingExtreme: () => import('./FundingRateExtremeStrategy.js').then(m => m.FundingRateExtremeStrategy),  // 别名

  // 跨交易所价差策略 / Cross-exchange spread strategy
  CrossExchangeSpread: () => import('./CrossExchangeSpreadStrategy.js').then(m => m.CrossExchangeSpreadStrategy),
  CrossExchange: () => import('./CrossExchangeSpreadStrategy.js').then(m => m.CrossExchangeSpreadStrategy),  // 别名

  // ============================================
  // 统计套利策略 / Statistical Arbitrage Strategies
  // ============================================

  // 统计套利策略 / Statistical arbitrage strategy
  StatisticalArbitrage: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),
  StatArb: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // 别名
  Pairs: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // 别名
  Cointegration: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // 别名

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
