/**
 * 策略模块导出文件
 * Strategies Module Export File
 *
 * 统一导出所有策略类
 * Unified export of all strategy classes
 */

// 导出基类 / Export base class
export { BaseStrategy } from './BaseStrategy.js'; // 导出命名成员

// 导出各策略实现 / Export strategy implementations
export { SMAStrategy } from './SMAStrategy.js'; // 导出命名成员
export { RSIStrategy } from './RSIStrategy.js'; // 导出命名成员
export { BollingerBandsStrategy } from './BollingerBandsStrategy.js'; // 导出命名成员
export { MACDStrategy } from './MACDStrategy.js'; // 导出命名成员
export { GridStrategy } from './GridStrategy.js'; // 导出命名成员
export { FundingArbStrategy } from './FundingArbStrategy.js'; // 导出命名成员

// 波动率策略 / Volatility strategies
export { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js'; // 导出命名成员
export { BollingerWidthStrategy } from './BollingerWidthStrategy.js'; // 导出命名成员
export { VolatilityRegimeStrategy } from './VolatilityRegimeStrategy.js'; // 导出命名成员

// Regime 切换策略 / Regime switching strategy
export { RegimeSwitchingStrategy, MarketRegime, RegimeEvent } from './RegimeSwitchingStrategy.js'; // 导出命名成员

// 订单流策略 / Order flow strategy
export { OrderFlowStrategy } from './OrderFlowStrategy.js'; // 导出命名成员

// 多周期共振策略 / Multi-timeframe resonance strategy
export { MultiTimeframeStrategy } from './MultiTimeframeStrategy.js'; // 导出命名成员

// 加权组合策略 / Weighted combo strategy
export { WeightedComboStrategy } from './WeightedComboStrategy.js'; // 导出命名成员
export { SignalWeightingSystem, StrategyStatus } from './SignalWeightingSystem.js'; // 导出命名成员

// ============================================
// 横截面策略 (多币种) / Cross-Sectional Strategies (Multi-Asset)
// ============================================

// 横截面策略基类 / Cross-sectional strategy base class
export { // 导出命名成员
  CrossSectionalStrategy, // 执行语句
  AssetDataManager, // 执行语句
  PortfolioManager, // 执行语句
  CROSS_SECTIONAL_TYPES, // 执行语句
  RANK_DIRECTION, // 执行语句
  POSITION_TYPE, // 执行语句
} from './CrossSectionalStrategy.js'; // 执行语句

// 动量排名策略 / Momentum rank strategy
export { // 导出命名成员
  MomentumRankStrategy, // 执行语句
  MOMENTUM_METRICS, // 执行语句
} from './MomentumRankStrategy.js'; // 执行语句

// 强弱轮动策略 / Rotation strategy
export { // 导出命名成员
  RotationStrategy, // 执行语句
  STRENGTH_METRICS, // 执行语句
  ROTATION_TRIGGERS, // 执行语句
} from './RotationStrategy.js'; // 执行语句

// 资金费率极值策略 / Funding rate extreme strategy
export { // 导出命名成员
  FundingRateExtremeStrategy, // 执行语句
  FundingRateDataManager, // 执行语句
  FUNDING_FREQUENCY, // 执行语句
  EXTREME_DETECTION, // 执行语句
} from './FundingRateExtremeStrategy.js'; // 执行语句

// 跨交易所价差策略 / Cross-exchange spread strategy
export { // 导出命名成员
  CrossExchangeSpreadStrategy, // 执行语句
  CrossExchangePriceManager, // 执行语句
  ArbitragePositionManager, // 执行语句
  SUPPORTED_EXCHANGES, // 执行语句
  SPREAD_TYPES, // 执行语句
} from './CrossExchangeSpreadStrategy.js'; // 执行语句

// ============================================
// 统计套利策略 / Statistical Arbitrage Strategies
// ============================================

// 统计套利策略 / Statistical arbitrage strategy
export { // 导出命名成员
  StatisticalArbitrageStrategy, // 执行语句
  PriceSeriesStore, // 执行语句
  StatisticalCalculator, // 执行语句
  PairManager, // 执行语句
  SpreadCalculator, // 执行语句
  STAT_ARB_TYPE, // 执行语句
  PAIR_STATUS, // 执行语句
  SIGNAL_TYPE, // 执行语句
  STAT_ARB_DEFAULT_CONFIG, // 执行语句
} from './StatisticalArbitrageStrategy.js'; // 执行语句

// ============================================
// 自适应参数策略 / Adaptive Strategy
// ============================================

export { // 导出命名成员
  AdaptiveStrategy, // 执行语句
  AdaptiveMode, // 执行语句
} from './AdaptiveStrategy.js'; // 执行语句

// ============================================
// 风控驱动策略 / Risk-Driven Strategy
// ============================================

export { // 导出命名成员
  RiskDrivenStrategy, // 执行语句
  RiskMode, // 执行语句
  RiskLevel, // 执行语句
  RiskEvent, // 执行语句
} from './RiskDrivenStrategy.js'; // 执行语句

// ============================================
// 因子投资策略 / Factor Investing Strategy
// ============================================

export { // 导出命名成员
  FactorInvestingStrategy, // 执行语句
  POSITION_TYPE as FACTOR_POSITION_TYPE, // 执行语句
  WEIGHT_METHOD, // 执行语句
} from '../factors/FactorInvestingStrategy.js'; // 执行语句

// 导出因子库 / Export Factor Library
export * as FactorLibrary from '../factors/index.js'; // 执行语句

// 默认导出基类 / Default export base class
export { BaseStrategy as default } from './BaseStrategy.js'; // 导出命名成员

/**
 * 策略注册表
 * Strategy Registry
 *
 * 用于通过名称获取策略类
 * Used to get strategy class by name
 */
export const StrategyRegistry = { // 导出常量 StrategyRegistry
  // 策略映射 / Strategy mapping
  SMA: () => import('./SMAStrategy.js').then(m => m.SMAStrategy), // 策略映射
  RSI: () => import('./RSIStrategy.js').then(m => m.RSIStrategy), // RSI
  BollingerBands: () => import('./BollingerBandsStrategy.js').then(m => m.BollingerBandsStrategy), // 布林带Bands
  MACD: () => import('./MACDStrategy.js').then(m => m.MACDStrategy), // MACD
  Grid: () => import('./GridStrategy.js').then(m => m.GridStrategy), // 网格
  FundingArb: () => import('./FundingArbStrategy.js').then(m => m.FundingArbStrategy), // 资金费率Arb

  // 波动率策略 / Volatility strategies
  ATRBreakout: () => import('./ATRBreakoutStrategy.js').then(m => m.ATRBreakoutStrategy), // ATR突破
  BollingerWidth: () => import('./BollingerWidthStrategy.js').then(m => m.BollingerWidthStrategy), // 布林带宽度
  VolatilityRegime: () => import('./VolatilityRegimeStrategy.js').then(m => m.VolatilityRegimeStrategy), // 波动率状态

  // Regime 切换策略 / Regime switching strategy
  RegimeSwitching: () => import('./RegimeSwitchingStrategy.js').then(m => m.RegimeSwitchingStrategy), // Regime 切换策略

  // 订单流策略 / Order flow strategy
  OrderFlow: () => import('./OrderFlowStrategy.js').then(m => m.OrderFlowStrategy), // 订单流

  // 多周期共振策略 / Multi-timeframe resonance strategy
  MultiTimeframe: () => import('./MultiTimeframeStrategy.js').then(m => m.MultiTimeframeStrategy), // 多周期共振策略
  MTF: () => import('./MultiTimeframeStrategy.js').then(m => m.MultiTimeframeStrategy),  // MTF

  // 加权组合策略 / Weighted combo strategy
  WeightedCombo: () => import('./WeightedComboStrategy.js').then(m => m.WeightedComboStrategy), // WeightedCombo
  Combo: () => import('./WeightedComboStrategy.js').then(m => m.WeightedComboStrategy),  // Combo

  // ============================================
  // 横截面策略 / Cross-Sectional Strategies
  // ============================================

  // 横截面策略基类 / Cross-sectional base
  CrossSectional: () => import('./CrossSectionalStrategy.js').then(m => m.CrossSectionalStrategy), // CrossSectional

  // 动量排名策略 / Momentum rank strategy
  MomentumRank: () => import('./MomentumRankStrategy.js').then(m => m.MomentumRankStrategy), // 动量Rank
  Momentum: () => import('./MomentumRankStrategy.js').then(m => m.MomentumRankStrategy),  // 动量

  // 强弱轮动策略 / Rotation strategy
  Rotation: () => import('./RotationStrategy.js').then(m => m.RotationStrategy), // Rotation
  TopBottom: () => import('./RotationStrategy.js').then(m => m.RotationStrategy),  // TopBottom

  // 资金费率极值策略 / Funding rate extreme strategy
  FundingRateExtreme: () => import('./FundingRateExtremeStrategy.js').then(m => m.FundingRateExtremeStrategy), // 资金费率极值策略
  FundingExtreme: () => import('./FundingRateExtremeStrategy.js').then(m => m.FundingRateExtremeStrategy),  // 资金费率极端

  // 跨交易所价差策略 / Cross-exchange spread strategy
  CrossExchangeSpread: () => import('./CrossExchangeSpreadStrategy.js').then(m => m.CrossExchangeSpreadStrategy), // 跨交易所价差策略
  CrossExchange: () => import('./CrossExchangeSpreadStrategy.js').then(m => m.CrossExchangeSpreadStrategy),  // Cross交易所

  // ============================================
  // 统计套利策略 / Statistical Arbitrage Strategies
  // ============================================

  // 统计套利策略 / Statistical arbitrage strategy
  StatisticalArbitrage: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy), // 统计套利
  StatArb: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // StatArb
  Pairs: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // Pairs
  Cointegration: () => import('./StatisticalArbitrageStrategy.js').then(m => m.StatisticalArbitrageStrategy),  // 协整

  // ============================================
  // 自适应参数策略 / Adaptive Strategy
  // ============================================

  // 自适应参数策略 / Adaptive strategy
  Adaptive: () => import('./AdaptiveStrategy.js').then(m => m.AdaptiveStrategy), // Adaptive
  AdaptiveParams: () => import('./AdaptiveStrategy.js').then(m => m.AdaptiveStrategy),  // AdaptiveParams

  // ============================================
  // 风控驱动策略 / Risk-Driven Strategy
  // ============================================

  // 风控驱动策略 / Risk-driven strategy
  RiskDriven: () => import('./RiskDrivenStrategy.js').then(m => m.RiskDrivenStrategy), // 风险Driven
  RiskBased: () => import('./RiskDrivenStrategy.js').then(m => m.RiskDrivenStrategy),  // 风险Based
  TargetVol: () => import('./RiskDrivenStrategy.js').then(m => m.RiskDrivenStrategy),  // Target波动率
  RiskParity: () => import('./RiskDrivenStrategy.js').then(m => m.RiskDrivenStrategy),  // 风险Parity
  DrawdownControl: () => import('./RiskDrivenStrategy.js').then(m => m.RiskDrivenStrategy),  // 回撤控制

  // ============================================
  // 因子投资策略 / Factor Investing Strategy
  // ============================================

  // 因子投资策略 / Factor investing strategy
  FactorInvesting: () => import('../factors/FactorInvestingStrategy.js').then(m => m.FactorInvestingStrategy), // FactorInvesting
  Factors: () => import('../factors/FactorInvestingStrategy.js').then(m => m.FactorInvestingStrategy),  // Factors
  MultiFactors: () => import('../factors/FactorInvestingStrategy.js').then(m => m.FactorInvestingStrategy),  // MultiFactors
  AlphaFactory: () => import('../factors/FactorInvestingStrategy.js').then(m => m.FactorInvestingStrategy),  // AlphaFactory

  /**
   * 获取策略类
   * Get strategy class
   * @param {string} name - 策略名称 / Strategy name
   * @returns {Promise<Class>} 策略类 / Strategy class
   */
  async get(name) { // 执行语句
    const loader = this[name]; // 定义常量 loader
    if (!loader) { // 条件判断 !loader
      throw new Error(`未知策略: ${name} / Unknown strategy: ${name}`); // 抛出异常
    } // 结束代码块
    return await loader(); // 返回结果
  }, // 结束代码块

  /**
   * 获取所有可用策略名称
   * Get all available strategy names
   * @returns {Array<string>} 策略名称列表 / Strategy name list
   */
  getAvailableStrategies() { // 调用 getAvailableStrategies
    return Object.keys(this).filter(key => typeof this[key] === 'function' && key !== 'get' && key !== 'getAvailableStrategies'); // 返回结果
  }, // 结束代码块
}; // 结束代码块
