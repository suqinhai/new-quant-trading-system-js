/**
 * Alpha 因子库
 * Alpha Factor Library
 *
 * 导出所有因子和工具
 * Export all factors and utilities
 */

// ============================================
// 基础设施 / Infrastructure
// ============================================

import { // 导入依赖
  BaseFactor, // 执行语句
  FACTOR_CATEGORY, // 执行语句
  FACTOR_DIRECTION, // 执行语句
  FACTOR_FREQUENCY, // 执行语句
} from './BaseFactor.js'; // 执行语句

export { // 导出命名成员
  BaseFactor, // 执行语句
  FACTOR_CATEGORY, // 执行语句
  FACTOR_DIRECTION, // 执行语句
  FACTOR_FREQUENCY, // 执行语句
}; // 结束代码块

import { // 导入依赖
  FactorRegistry, // 执行语句
  getGlobalRegistry, // 执行语句
  resetGlobalRegistry, // 执行语句
} from './FactorRegistry.js'; // 执行语句

export { // 导出命名成员
  FactorRegistry, // 执行语句
  getGlobalRegistry, // 执行语句
  resetGlobalRegistry, // 执行语句
}; // 结束代码块

import { // 导入依赖
  FactorCombiner, // 执行语句
  NORMALIZATION_METHOD, // 执行语句
  COMBINATION_METHOD, // 执行语句
  createDefaultCombiner, // 执行语句
  createEqualWeightCombiner, // 执行语句
  createRankCombiner, // 执行语句
} from './FactorCombiner.js'; // 执行语句

export { // 导出命名成员
  FactorCombiner, // 执行语句
  NORMALIZATION_METHOD, // 执行语句
  COMBINATION_METHOD, // 执行语句
  createDefaultCombiner, // 执行语句
  createEqualWeightCombiner, // 执行语句
  createRankCombiner, // 执行语句
}; // 结束代码块

// ============================================
// 因子实现 / Factor Implementations
// ============================================

// 动量因子 / Momentum Factors
import { // 导入依赖
  MomentumFactor, // 执行语句
  MOMENTUM_TYPE, // 执行语句
  Momentum1D, // 执行语句
  Momentum7D, // 执行语句
  Momentum30D, // 执行语句
  RiskAdjustedMomentum7D, // 执行语句
  MomentumAcceleration14D, // 执行语句
  createMomentumFactor, // 执行语句
} from './factors/MomentumFactor.js'; // 执行语句

export { // 导出命名成员
  MomentumFactor, // 执行语句
  MOMENTUM_TYPE, // 执行语句
  Momentum1D, // 执行语句
  Momentum7D, // 执行语句
  Momentum30D, // 执行语句
  RiskAdjustedMomentum7D, // 执行语句
  MomentumAcceleration14D, // 执行语句
  createMomentumFactor, // 执行语句
}; // 结束代码块

// 波动率因子 / Volatility Factors
import { // 导入依赖
  VolatilityFactor, // 执行语句
  VOLATILITY_METHOD, // 执行语句
  BollingerWidth20, // 执行语句
  ATRRatio, // 执行语句
  KeltnerSqueeze, // 执行语句
  VolatilityPercentile, // 执行语句
  createVolatilityFactor, // 执行语句
} from './factors/VolatilityFactor.js'; // 执行语句

export { // 导出命名成员
  VolatilityFactor, // 执行语句
  VOLATILITY_METHOD, // 执行语句
  BollingerWidth20, // 执行语句
  ATRRatio, // 执行语句
  KeltnerSqueeze, // 执行语句
  VolatilityPercentile, // 执行语句
  createVolatilityFactor, // 执行语句
}; // 结束代码块

// 资金流向因子 / Money Flow Factors
import { // 导入依赖
  MoneyFlowFactor, // 执行语句
  MONEY_FLOW_METHOD, // 执行语句
  MFI14, // 执行语句
  OBVSlope20, // 执行语句
  CMF20, // 执行语句
  VolumeRatio14, // 执行语句
  createMoneyFlowFactor, // 执行语句
} from './factors/MoneyFlowFactor.js'; // 执行语句

export { // 导出命名成员
  MoneyFlowFactor, // 执行语句
  MONEY_FLOW_METHOD, // 执行语句
  MFI14, // 执行语句
  OBVSlope20, // 执行语句
  CMF20, // 执行语句
  VolumeRatio14, // 执行语句
  createMoneyFlowFactor, // 执行语句
}; // 结束代码块

// 换手率因子 / Turnover Factors
import { // 导入依赖
  TurnoverFactor, // 执行语句
  TURNOVER_METHOD, // 执行语句
  VolumeMAR20, // 执行语句
  VolumeRank60, // 执行语句
  RelativeVolume, // 执行语句
  AbnormalVolume, // 执行语句
  createTurnoverFactor, // 执行语句
} from './factors/TurnoverFactor.js'; // 执行语句

export { // 导出命名成员
  TurnoverFactor, // 执行语句
  TURNOVER_METHOD, // 执行语句
  VolumeMAR20, // 执行语句
  VolumeRank60, // 执行语句
  RelativeVolume, // 执行语句
  AbnormalVolume, // 执行语句
  createTurnoverFactor, // 执行语句
}; // 结束代码块

// 资金费率因子 / Funding Rate Factors
import { // 导入依赖
  FundingRateFactor, // 执行语句
  FUNDING_RATE_METHOD, // 执行语句
  FundingRateCurrent, // 执行语句
  FundingRateAvg7D, // 执行语句
  FundingRatePercentile, // 执行语句
  FundingRateZScore, // 执行语句
  FundingRateExtreme, // 执行语句
  FundingRateCumulative, // 执行语句
  createFundingRateFactor, // 执行语句
} from './factors/FundingRateFactor.js'; // 执行语句

export { // 导出命名成员
  FundingRateFactor, // 执行语句
  FUNDING_RATE_METHOD, // 执行语句
  FundingRateCurrent, // 执行语句
  FundingRateAvg7D, // 执行语句
  FundingRatePercentile, // 执行语句
  FundingRateZScore, // 执行语句
  FundingRateExtreme, // 执行语句
  FundingRateCumulative, // 执行语句
  createFundingRateFactor, // 执行语句
}; // 结束代码块

// 大单因子 / Large Order Factors
import { // 导入依赖
  LargeOrderFactor, // 执行语句
  LARGE_ORDER_METHOD, // 执行语句
  LargeOrderVolumeRatio, // 执行语句
  LargeOrderNetFlow, // 执行语句
  LargeOrderBuySell, // 执行语句
  WhaleActivity, // 执行语句
  LargeOrderImbalance, // 执行语句
  createLargeOrderFactor, // 执行语句
} from './factors/LargeOrderFactor.js'; // 执行语句

export { // 导出命名成员
  LargeOrderFactor, // 执行语句
  LARGE_ORDER_METHOD, // 执行语句
  LargeOrderVolumeRatio, // 执行语句
  LargeOrderNetFlow, // 执行语句
  LargeOrderBuySell, // 执行语句
  WhaleActivity, // 执行语句
  LargeOrderImbalance, // 执行语句
  createLargeOrderFactor, // 执行语句
}; // 结束代码块

// ============================================
// 策略 / Strategy
// ============================================

import { // 导入依赖
  FactorInvestingStrategy, // 执行语句
  POSITION_TYPE, // 执行语句
  WEIGHT_METHOD, // 执行语句
} from './FactorInvestingStrategy.js'; // 执行语句

export { // 导出命名成员
  FactorInvestingStrategy, // 执行语句
  POSITION_TYPE, // 执行语句
  WEIGHT_METHOD, // 执行语句
}; // 结束代码块

// ============================================
// 预定义因子集合 / Predefined Factor Collections
// ============================================

/**
 * 所有预定义因子实例
 * All predefined factor instances
 */
export const PREDEFINED_FACTORS = { // 导出常量 PREDEFINED_FACTORS
  // 动量因子
  momentum: { // 设置 momentum 字段
    Momentum1D, // 执行语句
    Momentum7D, // 执行语句
    Momentum30D, // 执行语句
    RiskAdjustedMomentum7D, // 执行语句
    MomentumAcceleration14D, // 执行语句
  }, // 结束代码块

  // 波动率因子
  volatility: { // 设置 volatility 字段
    BollingerWidth20, // 执行语句
    ATRRatio, // 执行语句
    KeltnerSqueeze, // 执行语句
    VolatilityPercentile, // 执行语句
  }, // 结束代码块

  // 资金流向因子
  moneyFlow: { // 设置 moneyFlow 字段
    MFI14, // 执行语句
    OBVSlope20, // 执行语句
    CMF20, // 执行语句
    VolumeRatio14, // 执行语句
  }, // 结束代码块

  // 换手率因子
  turnover: { // 设置 turnover 字段
    VolumeMAR20, // 执行语句
    VolumeRank60, // 执行语句
    RelativeVolume, // 执行语句
    AbnormalVolume, // 执行语句
  }, // 结束代码块

  // 资金费率因子
  fundingRate: { // 设置 fundingRate 字段
    FundingRateCurrent, // 执行语句
    FundingRateAvg7D, // 执行语句
    FundingRatePercentile, // 执行语句
    FundingRateZScore, // 执行语句
    FundingRateExtreme, // 执行语句
    FundingRateCumulative, // 执行语句
  }, // 结束代码块

  // 大单因子
  largeOrder: { // 设置 largeOrder 字段
    LargeOrderVolumeRatio, // 执行语句
    LargeOrderNetFlow, // 执行语句
    LargeOrderBuySell, // 执行语句
    WhaleActivity, // 执行语句
    LargeOrderImbalance, // 执行语句
  }, // 结束代码块
}; // 结束代码块

/**
 * 快速创建因子注册表并注册所有预定义因子
 * Quick create factor registry with all predefined factors
 */
export function createFullRegistry() { // 导出函数 createFullRegistry
  const registry = new FactorRegistry(); // 定义常量 registry

  // 注册所有因子
  Object.values(PREDEFINED_FACTORS).forEach(category => { // 调用 Object.values
    Object.values(category).forEach(factor => { // 调用 Object.values
      registry.register(factor); // 调用 registry.register
    }); // 结束代码块
  }); // 结束代码块

  return registry; // 返回结果
} // 结束代码块

/**
 * 快速创建常用因子集合的注册表
 * Quick create registry with common factor set
 */
export function createCommonRegistry() { // 导出函数 createCommonRegistry
  const registry = new FactorRegistry(); // 定义常量 registry

  // 注册常用因子
  registry.register(Momentum7D); // 调用 registry.register
  registry.register(Momentum30D); // 调用 registry.register
  registry.register(BollingerWidth20); // 调用 registry.register
  registry.register(MFI14); // 调用 registry.register
  registry.register(RelativeVolume); // 调用 registry.register

  return registry; // 返回结果
} // 结束代码块

// 默认导出
export default { // 默认导出
  // 基础类
  BaseFactor, // 执行语句
  FactorRegistry, // 执行语句
  FactorCombiner, // 执行语句
  FactorInvestingStrategy, // 执行语句

  // 工厂函数
  createMomentumFactor, // 执行语句
  createVolatilityFactor, // 执行语句
  createMoneyFlowFactor, // 执行语句
  createTurnoverFactor, // 执行语句
  createFundingRateFactor, // 执行语句
  createLargeOrderFactor, // 执行语句

  // 便捷函数
  createFullRegistry, // 执行语句
  createCommonRegistry, // 执行语句
  getGlobalRegistry, // 执行语句

  // 预定义因子
  PREDEFINED_FACTORS, // 执行语句
}; // 结束代码块
