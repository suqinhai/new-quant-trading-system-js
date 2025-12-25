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

import {
  BaseFactor,
  FACTOR_CATEGORY,
  FACTOR_DIRECTION,
  FACTOR_FREQUENCY,
} from './BaseFactor.js';

export {
  BaseFactor,
  FACTOR_CATEGORY,
  FACTOR_DIRECTION,
  FACTOR_FREQUENCY,
};

import {
  FactorRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from './FactorRegistry.js';

export {
  FactorRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
};

import {
  FactorCombiner,
  NORMALIZATION_METHOD,
  COMBINATION_METHOD,
  createDefaultCombiner,
  createEqualWeightCombiner,
  createRankCombiner,
} from './FactorCombiner.js';

export {
  FactorCombiner,
  NORMALIZATION_METHOD,
  COMBINATION_METHOD,
  createDefaultCombiner,
  createEqualWeightCombiner,
  createRankCombiner,
};

// ============================================
// 因子实现 / Factor Implementations
// ============================================

// 动量因子 / Momentum Factors
import {
  MomentumFactor,
  MOMENTUM_TYPE,
  Momentum1D,
  Momentum7D,
  Momentum30D,
  RiskAdjustedMomentum7D,
  MomentumAcceleration14D,
  createMomentumFactor,
} from './factors/MomentumFactor.js';

export {
  MomentumFactor,
  MOMENTUM_TYPE,
  Momentum1D,
  Momentum7D,
  Momentum30D,
  RiskAdjustedMomentum7D,
  MomentumAcceleration14D,
  createMomentumFactor,
};

// 波动率因子 / Volatility Factors
import {
  VolatilityFactor,
  VOLATILITY_METHOD,
  BollingerWidth20,
  ATRRatio,
  KeltnerSqueeze,
  VolatilityPercentile,
  createVolatilityFactor,
} from './factors/VolatilityFactor.js';

export {
  VolatilityFactor,
  VOLATILITY_METHOD,
  BollingerWidth20,
  ATRRatio,
  KeltnerSqueeze,
  VolatilityPercentile,
  createVolatilityFactor,
};

// 资金流向因子 / Money Flow Factors
import {
  MoneyFlowFactor,
  MONEY_FLOW_METHOD,
  MFI14,
  OBVSlope20,
  CMF20,
  VolumeRatio14,
  createMoneyFlowFactor,
} from './factors/MoneyFlowFactor.js';

export {
  MoneyFlowFactor,
  MONEY_FLOW_METHOD,
  MFI14,
  OBVSlope20,
  CMF20,
  VolumeRatio14,
  createMoneyFlowFactor,
};

// 换手率因子 / Turnover Factors
import {
  TurnoverFactor,
  TURNOVER_METHOD,
  VolumeMAR20,
  VolumeRank60,
  RelativeVolume,
  AbnormalVolume,
  createTurnoverFactor,
} from './factors/TurnoverFactor.js';

export {
  TurnoverFactor,
  TURNOVER_METHOD,
  VolumeMAR20,
  VolumeRank60,
  RelativeVolume,
  AbnormalVolume,
  createTurnoverFactor,
};

// 资金费率因子 / Funding Rate Factors
import {
  FundingRateFactor,
  FUNDING_RATE_METHOD,
  FundingRateCurrent,
  FundingRateAvg7D,
  FundingRatePercentile,
  FundingRateZScore,
  FundingRateExtreme,
  FundingRateCumulative,
  createFundingRateFactor,
} from './factors/FundingRateFactor.js';

export {
  FundingRateFactor,
  FUNDING_RATE_METHOD,
  FundingRateCurrent,
  FundingRateAvg7D,
  FundingRatePercentile,
  FundingRateZScore,
  FundingRateExtreme,
  FundingRateCumulative,
  createFundingRateFactor,
};

// 大单因子 / Large Order Factors
import {
  LargeOrderFactor,
  LARGE_ORDER_METHOD,
  LargeOrderVolumeRatio,
  LargeOrderNetFlow,
  LargeOrderBuySell,
  WhaleActivity,
  LargeOrderImbalance,
  createLargeOrderFactor,
} from './factors/LargeOrderFactor.js';

export {
  LargeOrderFactor,
  LARGE_ORDER_METHOD,
  LargeOrderVolumeRatio,
  LargeOrderNetFlow,
  LargeOrderBuySell,
  WhaleActivity,
  LargeOrderImbalance,
  createLargeOrderFactor,
};

// ============================================
// 策略 / Strategy
// ============================================

import {
  FactorInvestingStrategy,
  POSITION_TYPE,
  WEIGHT_METHOD,
} from './FactorInvestingStrategy.js';

export {
  FactorInvestingStrategy,
  POSITION_TYPE,
  WEIGHT_METHOD,
};

// ============================================
// 预定义因子集合 / Predefined Factor Collections
// ============================================

/**
 * 所有预定义因子实例
 * All predefined factor instances
 */
export const PREDEFINED_FACTORS = {
  // 动量因子
  momentum: {
    Momentum1D,
    Momentum7D,
    Momentum30D,
    RiskAdjustedMomentum7D,
    MomentumAcceleration14D,
  },

  // 波动率因子
  volatility: {
    BollingerWidth20,
    ATRRatio,
    KeltnerSqueeze,
    VolatilityPercentile,
  },

  // 资金流向因子
  moneyFlow: {
    MFI14,
    OBVSlope20,
    CMF20,
    VolumeRatio14,
  },

  // 换手率因子
  turnover: {
    VolumeMAR20,
    VolumeRank60,
    RelativeVolume,
    AbnormalVolume,
  },

  // 资金费率因子
  fundingRate: {
    FundingRateCurrent,
    FundingRateAvg7D,
    FundingRatePercentile,
    FundingRateZScore,
    FundingRateExtreme,
    FundingRateCumulative,
  },

  // 大单因子
  largeOrder: {
    LargeOrderVolumeRatio,
    LargeOrderNetFlow,
    LargeOrderBuySell,
    WhaleActivity,
    LargeOrderImbalance,
  },
};

/**
 * 快速创建因子注册表并注册所有预定义因子
 * Quick create factor registry with all predefined factors
 */
export function createFullRegistry() {
  const registry = new FactorRegistry();

  // 注册所有因子
  Object.values(PREDEFINED_FACTORS).forEach(category => {
    Object.values(category).forEach(factor => {
      registry.register(factor);
    });
  });

  return registry;
}

/**
 * 快速创建常用因子集合的注册表
 * Quick create registry with common factor set
 */
export function createCommonRegistry() {
  const registry = new FactorRegistry();

  // 注册常用因子
  registry.register(Momentum7D);
  registry.register(Momentum30D);
  registry.register(BollingerWidth20);
  registry.register(MFI14);
  registry.register(RelativeVolume);

  return registry;
}

// 默认导出
export default {
  // 基础类
  BaseFactor,
  FactorRegistry,
  FactorCombiner,
  FactorInvestingStrategy,

  // 工厂函数
  createMomentumFactor,
  createVolatilityFactor,
  createMoneyFlowFactor,
  createTurnoverFactor,
  createFundingRateFactor,
  createLargeOrderFactor,

  // 便捷函数
  createFullRegistry,
  createCommonRegistry,
  getGlobalRegistry,

  // 预定义因子
  PREDEFINED_FACTORS,
};
