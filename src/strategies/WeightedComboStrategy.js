/**
 * 加权组合策略 (Weighted Combo Strategy)
 *
 * 整合多个子策略信号，使用加权打分制决定交易：
 * 1. 每个策略产生 0-1 的信号得分
 * 2. 按权重加权计算总分
 * 3. 总分 >= 阈值才执行交易
 *
 * 内置功能:
 * - 策略打分制 (Signal Score)
 * - 策略权重动态调整
 * - 最大相关性限制
 * - 策略熔断机制
 *
 * 示例:
 *   SMA = 0.4, RSI = 0.2, FundingRate = 0.4
 *   总分 >= 0.7 才交易
 */

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { SignalWeightingSystem, StrategyStatus } from './SignalWeightingSystem.js'; // 导入模块 ./SignalWeightingSystem.js

// 子策略导入 - 基础策略
import { SMAStrategy } from './SMAStrategy.js'; // 导入模块 ./SMAStrategy.js
import { RSIStrategy } from './RSIStrategy.js'; // 导入模块 ./RSIStrategy.js
import { MACDStrategy } from './MACDStrategy.js'; // 导入模块 ./MACDStrategy.js
import { BollingerBandsStrategy } from './BollingerBandsStrategy.js'; // 导入模块 ./BollingerBandsStrategy.js
import { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js'; // 导入模块 ./ATRBreakoutStrategy.js
import { FundingArbStrategy } from './FundingArbStrategy.js'; // 导入模块 ./FundingArbStrategy.js

// 子策略导入 - 波动率策略
import { BollingerWidthStrategy } from './BollingerWidthStrategy.js'; // 导入模块 ./BollingerWidthStrategy.js
import { VolatilityRegimeStrategy } from './VolatilityRegimeStrategy.js'; // 导入模块 ./VolatilityRegimeStrategy.js

// 子策略导入 - 高级策略
import { GridStrategy } from './GridStrategy.js'; // 导入模块 ./GridStrategy.js
import { OrderFlowStrategy } from './OrderFlowStrategy.js'; // 导入模块 ./OrderFlowStrategy.js
import { MultiTimeframeStrategy } from './MultiTimeframeStrategy.js'; // 导入模块 ./MultiTimeframeStrategy.js
import { RegimeSwitchingStrategy } from './RegimeSwitchingStrategy.js'; // 导入模块 ./RegimeSwitchingStrategy.js
import { AdaptiveStrategy } from './AdaptiveStrategy.js'; // 导入模块 ./AdaptiveStrategy.js
import { RiskDrivenStrategy } from './RiskDrivenStrategy.js'; // 导入模块 ./RiskDrivenStrategy.js

// 子策略导入 - 横截面策略
import { CrossSectionalStrategy } from './CrossSectionalStrategy.js'; // 导入模块 ./CrossSectionalStrategy.js
import { MomentumRankStrategy } from './MomentumRankStrategy.js'; // 导入模块 ./MomentumRankStrategy.js
import { RotationStrategy } from './RotationStrategy.js'; // 导入模块 ./RotationStrategy.js
import { FundingRateExtremeStrategy } from './FundingRateExtremeStrategy.js'; // 导入模块 ./FundingRateExtremeStrategy.js
import { CrossExchangeSpreadStrategy } from './CrossExchangeSpreadStrategy.js'; // 导入模块 ./CrossExchangeSpreadStrategy.js
import { StatisticalArbitrageStrategy } from './StatisticalArbitrageStrategy.js'; // 导入模块 ./StatisticalArbitrageStrategy.js

/**
 * 获取策略类映射
 * Get Strategy Class Map
 *
 * 使用函数形式延迟获取策略类，避免循环依赖问题
 * Use function to lazily get strategy classes, avoiding circular dependency issues
 *
 * @returns {Object} 策略类映射
 */
function getStrategyClassMap() { // 定义函数 getStrategyClassMap
  return { // 返回结果
    // 基础趋势策略 / Basic trend strategies
    SMA: SMAStrategy, // SMA
    RSI: RSIStrategy, // RSI
    MACD: MACDStrategy, // MACD
    BollingerBands: BollingerBandsStrategy, // 布林带Bands
    ATRBreakout: ATRBreakoutStrategy, // ATR突破

    // 资金费率策略 / Funding rate strategies
    FundingRate: FundingArbStrategy, // 资金费率频率
    FundingArb: FundingArbStrategy, // 资金费率Arb
    FundingRateExtreme: FundingRateExtremeStrategy, // 资金费率频率极端

    // 波动率策略 / Volatility strategies
    BollingerWidth: BollingerWidthStrategy, // 布林带宽度
    VolatilityRegime: VolatilityRegimeStrategy, // 波动率状态

    // 网格与订单流策略 / Grid and order flow strategies
    Grid: GridStrategy, // 网格与订单流策略
    OrderFlow: OrderFlowStrategy, // 订单流

    // 多周期与自适应策略 / Multi-timeframe and adaptive strategies
    MultiTimeframe: MultiTimeframeStrategy, // 多周期与自适应策略
    MTF: MultiTimeframeStrategy, // MTF
    RegimeSwitching: RegimeSwitchingStrategy, // 状态Switching
    Adaptive: AdaptiveStrategy, // Adaptive

    // 风控驱动策略 / Risk-driven strategies
    RiskDriven: RiskDrivenStrategy, // 风险Driven

    // 横截面策略 / Cross-sectional strategies
    CrossSectional: CrossSectionalStrategy, // CrossSectional
    MomentumRank: MomentumRankStrategy, // 动量Rank
    Momentum: MomentumRankStrategy, // 动量
    Rotation: RotationStrategy, // Rotation

    // 套利策略 / Arbitrage strategies
    CrossExchangeSpread: CrossExchangeSpreadStrategy, // Cross交易所价差
    CrossExchange: CrossExchangeSpreadStrategy, // Cross交易所
    StatisticalArbitrage: StatisticalArbitrageStrategy, // 统计套利
    StatArb: StatisticalArbitrageStrategy, // StatArb
  }; // 结束代码块
} // 结束代码块

/**
 * 信号转换器: 将各种策略信号转换为 0-1 得分
 */
const SignalConverters = { // 定义常量 SignalConverters
  /**
   * SMA 策略信号转换
   * 基于均线距离计算得分
   */
  SMA: (strategy, candle) => { // SMA
    const shortMA = strategy.getIndicator('shortMA'); // 定义常量 shortMA
    const longMA = strategy.getIndicator('longMA'); // 定义常量 longMA

    if (!shortMA || !longMA) return 0.5; // 条件判断 !shortMA || !longMA

    // 计算均线差距百分比
    const diff = (shortMA - longMA) / longMA; // 定义常量 diff

    // 转换为 0-1 得分
    // diff > 0 看多, diff < 0 看空
    // 使用 sigmoid 函数平滑转换
    const score = 1 / (1 + Math.exp(-diff * 100)); // 定义常量 score

    return score; // 返回结果
  }, // 结束代码块

  /**
   * RSI 策略信号转换
   * RSI < 30 → 1.0 (强烈看多)
   * RSI = 50 → 0.5 (中性)
   * RSI > 70 → 0.0 (强烈看空)
   */
  RSI: (strategy, candle) => { // RSI
    const rsi = strategy.getIndicator('rsi'); // 定义常量 rsi

    if (rsi === undefined || rsi === null) return 0.5; // 条件判断 rsi === undefined || rsi === null

    // 反转 RSI: 低 RSI = 高得分 (买入信号)
    const score = (100 - rsi) / 100; // 定义常量 score

    return Math.max(0, Math.min(1, score)); // 返回结果
  }, // 结束代码块

  /**
   * MACD 策略信号转换
   * 柱状图 > 0 看多, < 0 看空
   */
  MACD: (strategy, candle) => { // MACD
    const histogram = strategy.getIndicator('histogram'); // 定义常量 histogram

    if (histogram === undefined || histogram === null) return 0.5; // 条件判断 histogram === undefined || histogram === null

    // 归一化柱状图值
    const normalized = histogram / (Math.abs(histogram) + 0.001); // 定义常量 normalized

    // 转换为 0-1
    const score = (normalized + 1) / 2; // 定义常量 score

    return Math.max(0, Math.min(1, score)); // 返回结果
  }, // 结束代码块

  /**
   * 布林带策略信号转换
   * 价格在下轨附近 → 看多
   * 价格在上轨附近 → 看空
   */
  BollingerBands: (strategy, candle) => { // 布林带Bands
    const upper = strategy.getIndicator('upper'); // 定义常量 upper
    const lower = strategy.getIndicator('lower'); // 定义常量 lower
    const middle = strategy.getIndicator('middle'); // 定义常量 middle

    if (!upper || !lower || !middle) return 0.5; // 条件判断 !upper || !lower || !middle

    const price = candle.close; // 定义常量 price
    const range = upper - lower; // 定义常量 range

    if (range <= 0) return 0.5; // 条件判断 range <= 0

    // 计算价格在布林带中的位置
    const position = (price - lower) / range; // 定义常量 position

    // 反转: 接近下轨 = 高得分 (买入)
    const score = 1 - position; // 定义常量 score

    return Math.max(0, Math.min(1, score)); // 返回结果
  }, // 结束代码块

  /**
   * ATR 突破策略信号转换
   */
  ATRBreakout: (strategy, candle) => { // ATR突破
    const breakoutSignal = strategy.getIndicator('breakout'); // 定义常量 breakoutSignal
    const atrPercent = strategy.getIndicator('atrPercent'); // 定义常量 atrPercent

    if (breakoutSignal === undefined) return 0.5; // 条件判断 breakoutSignal === undefined

    // 1 = 上轨突破 (看多), -1 = 下轨突破 (看空), 0 = 无突破
    if (breakoutSignal === 1) return 0.8; // 条件判断 breakoutSignal === 1
    if (breakoutSignal === -1) return 0.2; // 条件判断 breakoutSignal === -1

    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 资金费率策略信号转换
   * 负费率 → 看多 (做多有利)
   * 正费率 → 看空 (做空有利)
   */
  FundingRate: (strategy, candle) => { // 资金费率频率
    const fundingRate = strategy.getIndicator('fundingRate'); // 定义常量 fundingRate

    if (fundingRate === undefined || fundingRate === null) return 0.5; // 条件判断 fundingRate === undefined || fundingRate === ...

    // 费率通常在 -0.1% 到 0.1% 之间
    // 转换为 0-1 得分
    const normalized = -fundingRate * 1000; // 放大 1000 倍

    // sigmoid 转换
    const score = 1 / (1 + Math.exp(-normalized)); // 定义常量 score

    return Math.max(0, Math.min(1, score)); // 返回结果
  }, // 结束代码块

  /**
   * 布林带宽度策略信号转换
   * 带宽收窄 → 即将突破，准备入场
   */
  BollingerWidth: (strategy, candle) => { // 布林带宽度
    const width = strategy.getIndicator('width'); // 定义常量 width
    const avgWidth = strategy.getIndicator('avgWidth'); // 定义常量 avgWidth
    const squeeze = strategy.getIndicator('squeeze'); // 定义常量 squeeze

    if (squeeze) return 0.7; // 挤压状态，准备突破
    if (width !== undefined && avgWidth !== undefined) { // 条件判断 width !== undefined && avgWidth !== undefined
      // 带宽低于平均值越多，得分越高
      const ratio = width / avgWidth; // 定义常量 ratio
      if (ratio < 0.8) return 0.75; // 条件判断 ratio < 0.8
      if (ratio < 1.0) return 0.6; // 条件判断 ratio < 1.0
    } // 结束代码块
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 波动率状态策略信号转换
   */
  VolatilityRegime: (strategy, candle) => { // 波动率状态
    const regime = strategy.getIndicator('regime'); // 定义常量 regime
    const signal = strategy.getSignal(); // 定义常量 signal

    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'

    // 根据波动率状态调整
    if (regime === 'low') return 0.6;  // 低波动，可能突破
    if (regime === 'high') return 0.4; // 高波动，谨慎
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 网格策略信号转换
   */
  Grid: (strategy, candle) => { // 网格
    const gridLevel = strategy.getIndicator('gridLevel'); // 定义常量 gridLevel
    const signal = strategy.getSignal(); // 定义常量 signal

    if (signal?.type === 'buy') return 0.75; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.25; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 订单流策略信号转换
   * 基于买卖压力
   */
  OrderFlow: (strategy, candle) => { // 订单流
    const buyPressure = strategy.getIndicator('buyPressure'); // 定义常量 buyPressure
    const sellPressure = strategy.getIndicator('sellPressure'); // 定义常量 sellPressure
    const imbalance = strategy.getIndicator('imbalance'); // 定义常量 imbalance

    if (imbalance !== undefined) { // 条件判断 imbalance !== undefined
      // imbalance > 0 表示买压大于卖压
      const score = 0.5 + (imbalance * 0.3); // 定义常量 score
      return Math.max(0, Math.min(1, score)); // 返回结果
    } // 结束代码块

    if (buyPressure !== undefined && sellPressure !== undefined) { // 条件判断 buyPressure !== undefined && sellPressure !==...
      const total = buyPressure + sellPressure; // 定义常量 total
      if (total > 0) { // 条件判断 total > 0
        return buyPressure / total; // 返回结果
      } // 结束代码块
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.75; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.25; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 多周期共振策略信号转换
   */
  MultiTimeframe: (strategy, candle) => { // Multi周期
    const alignment = strategy.getIndicator('alignment'); // 定义常量 alignment
    const strength = strategy.getIndicator('strength'); // 定义常量 strength

    if (alignment !== undefined) { // 条件判断 alignment !== undefined
      // alignment: 1 = 全部看多, -1 = 全部看空, 0 = 混合
      const score = (alignment + 1) / 2; // 定义常量 score
      // 结合强度调整
      if (strength !== undefined) { // 条件判断 strength !== undefined
        return score * 0.7 + strength * 0.3; // 返回结果
      } // 结束代码块
      return score; // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * Regime 切换策略信号转换
   */
  RegimeSwitching: (strategy, candle) => { // 状态Switching
    const regime = strategy.getIndicator('regime'); // 定义常量 regime
    const confidence = strategy.getIndicator('confidence') || 0.5; // 定义常量 confidence

    // 根据市场状态调整
    if (regime === 'trending_up') return 0.5 + (confidence * 0.4); // 条件判断 regime === 'trending_up'
    if (regime === 'trending_down') return 0.5 - (confidence * 0.4); // 条件判断 regime === 'trending_down'
    if (regime === 'ranging') return 0.5; // 条件判断 regime === 'ranging'

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.75; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.25; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 自适应策略信号转换
   */
  Adaptive: (strategy, candle) => { // Adaptive
    const adaptiveScore = strategy.getIndicator('adaptiveScore'); // 定义常量 adaptiveScore
    if (adaptiveScore !== undefined) { // 条件判断 adaptiveScore !== undefined
      return Math.max(0, Math.min(1, adaptiveScore)); // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 风控驱动策略信号转换
   */
  RiskDriven: (strategy, candle) => { // 风险Driven
    const riskScore = strategy.getIndicator('riskScore'); // 定义常量 riskScore
    const signal = strategy.getSignal(); // 定义常量 signal

    // 风险分数越低越好
    if (riskScore !== undefined) { // 条件判断 riskScore !== undefined
      const safetyScore = 1 - riskScore; // 定义常量 safetyScore
      if (signal?.type === 'buy') return 0.5 + (safetyScore * 0.4); // 条件判断 signal?.type === 'buy'
      if (signal?.type === 'sell') return 0.5 - (safetyScore * 0.4); // 条件判断 signal?.type === 'sell'
      return 0.5; // 返回结果
    } // 结束代码块

    if (signal?.type === 'buy') return 0.7; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.3; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 横截面策略信号转换
   */
  CrossSectional: (strategy, candle) => { // CrossSectional
    const rank = strategy.getIndicator('rank'); // 定义常量 rank
    const totalAssets = strategy.getIndicator('totalAssets') || 10; // 定义常量 totalAssets

    if (rank !== undefined && totalAssets > 0) { // 条件判断 rank !== undefined && totalAssets > 0
      // rank 1 = 最强 (买入), rank = totalAssets = 最弱 (卖出)
      const score = 1 - ((rank - 1) / (totalAssets - 1)); // 定义常量 score
      return Math.max(0, Math.min(1, score)); // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 动量排名策略信号转换
   */
  MomentumRank: (strategy, candle) => { // 动量Rank
    const momentum = strategy.getIndicator('momentum'); // 定义常量 momentum
    const rank = strategy.getIndicator('rank'); // 定义常量 rank

    if (momentum !== undefined) { // 条件判断 momentum !== undefined
      // 正动量 → 看多, 负动量 → 看空
      const score = 1 / (1 + Math.exp(-momentum * 10)); // 定义常量 score
      return score; // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 轮动策略信号转换
   */
  Rotation: (strategy, candle) => { // Rotation
    const strength = strategy.getIndicator('strength'); // 定义常量 strength
    const isLeader = strategy.getIndicator('isLeader'); // 定义常量 isLeader

    if (isLeader) return 0.85; // 条件判断 isLeader
    if (strength !== undefined) { // 条件判断 strength !== undefined
      // strength 通常在 -1 到 1 之间
      return (strength + 1) / 2; // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 资金费率极值策略信号转换
   */
  FundingRateExtreme: (strategy, candle) => { // 资金费率频率极端
    const fundingRate = strategy.getIndicator('fundingRate'); // 定义常量 fundingRate
    const isExtreme = strategy.getIndicator('isExtreme'); // 定义常量 isExtreme
    const extremeType = strategy.getIndicator('extremeType'); // 定义常量 extremeType

    if (isExtreme) { // 条件判断 isExtreme
      // 极端负费率 → 强烈看多, 极端正费率 → 强烈看空
      if (extremeType === 'negative') return 0.9; // 条件判断 extremeType === 'negative'
      if (extremeType === 'positive') return 0.1; // 条件判断 extremeType === 'positive'
    } // 结束代码块

    if (fundingRate !== undefined) { // 条件判断 fundingRate !== undefined
      const normalized = -fundingRate * 1000; // 定义常量 normalized
      return 1 / (1 + Math.exp(-normalized)); // 返回结果
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 跨交易所价差策略信号转换
   */
  CrossExchangeSpread: (strategy, candle) => { // Cross交易所价差
    const spread = strategy.getIndicator('spread'); // 定义常量 spread
    const threshold = strategy.getIndicator('threshold') || 0.001; // 定义常量 threshold

    if (spread !== undefined) { // 条件判断 spread !== undefined
      // 价差超过阈值 → 套利机会
      if (Math.abs(spread) > threshold) { // 条件判断 Math.abs(spread) > threshold
        return spread > 0 ? 0.8 : 0.2; // 返回结果
      } // 结束代码块
    } // 结束代码块

    const signal = strategy.getSignal(); // 定义常量 signal
    if (signal?.type === 'buy') return 0.75; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.25; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  /**
   * 统计套利策略信号转换
   */
  StatisticalArbitrage: (strategy, candle) => { // 统计套利
    const zscore = strategy.getIndicator('zscore'); // 定义常量 zscore
    const signal = strategy.getSignal(); // 定义常量 signal

    if (zscore !== undefined) { // 条件判断 zscore !== undefined
      // z-score > 2 → 做空, z-score < -2 → 做多
      if (zscore < -2) return 0.85; // 条件判断 zscore < -2
      if (zscore > 2) return 0.15; // 条件判断 zscore > 2
      // 线性插值
      const score = 0.5 - (zscore / 4) * 0.35; // 定义常量 score
      return Math.max(0.15, Math.min(0.85, score)); // 返回结果
    } // 结束代码块

    if (signal?.type === 'buy') return 0.8; // 条件判断 signal?.type === 'buy'
    if (signal?.type === 'sell') return 0.2; // 条件判断 signal?.type === 'sell'
    return 0.5; // 返回结果
  }, // 结束代码块

  // 别名映射到相同的转换器
  FundingArb: (strategy, candle) => SignalConverters.FundingRate(strategy, candle), // 别名映射到相同的转换器
  MTF: (strategy, candle) => SignalConverters.MultiTimeframe(strategy, candle), // MTF
  Momentum: (strategy, candle) => SignalConverters.MomentumRank(strategy, candle), // 动量
  CrossExchange: (strategy, candle) => SignalConverters.CrossExchangeSpread(strategy, candle), // Cross交易所
  StatArb: (strategy, candle) => SignalConverters.StatisticalArbitrage(strategy, candle), // StatArb

  /**
   * 默认转换器: 基于策略信号状态
   */
  default: (strategy, candle) => { // 默认
    const signal = strategy.getSignal(); // 定义常量 signal

    if (!signal) return 0.5; // 条件判断 !signal

    if (signal.type === 'buy') return 0.8; // 条件判断 signal.type === 'buy'
    if (signal.type === 'sell') return 0.2; // 条件判断 signal.type === 'sell'

    return 0.5; // 返回结果
  }, // 结束代码块
}; // 结束代码块

/**
 * 加权组合策略类
 */
export class WeightedComboStrategy extends BaseStrategy { // 导出类 WeightedComboStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'WeightedComboStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // ============================================
    // 基础配置
    // ============================================

    // 交易对
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // ============================================
    // 策略权重配置
    // ============================================

    // 策略权重配置 { name: weight }
    // 示例: { SMA: 0.4, RSI: 0.2, FundingRate: 0.4 }
    this.strategyWeights = params.strategyWeights || { // 设置 strategyWeights
      SMA: 0.4, // SMA
      RSI: 0.2, // RSI
      MACD: 0.4, // MACD
    }; // 结束代码块

    // 交易阈值: 总分 >= threshold 买入 (降低阈值增加触发机会)
    this.buyThreshold = params.buyThreshold || 0.6; // 设置 buyThreshold

    // 卖出阈值: 总分 <= threshold 卖出 (提高阈值增加触发机会)
    this.sellThreshold = params.sellThreshold || 0.4; // 设置 sellThreshold

    // ============================================
    // 子策略参数
    // ============================================

    this.strategyParams = { // 设置 strategyParams
      SMA: params.smaParams || { shortPeriod: 10, longPeriod: 30 }, // SMA
      RSI: params.rsiParams || { period: 14, overbought: 70, oversold: 30 }, // RSI
      MACD: params.macdParams || { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, // MACD
      BollingerBands: params.bbParams || { period: 20, stdDev: 2 }, // 布林带Bands
      ATRBreakout: params.atrParams || { period: 14, multiplier: 2 }, // ATR突破
      FundingRate: params.fundingParams || {}, // 资金费率频率
      ...params.customStrategyParams, // 展开对象或数组
    }; // 结束代码块

    // ============================================
    // 权重系统配置
    // ============================================

    this.weightSystemConfig = { // 设置 weightSystemConfig
      // 动态权重
      dynamicWeights: params.dynamicWeights !== false, // dynamicWeights
      adjustmentFactor: params.adjustmentFactor || 0.2, // adjustmentFactor
      evaluationPeriod: params.evaluationPeriod || 20, // evaluation周期
      minWeight: params.minWeight || 0.05, // 最小Weight
      maxWeight: params.maxWeight || 0.6, // 最大Weight

      // 相关性限制
      correlationLimit: params.correlationLimit !== false, // correlation限制
      maxCorrelation: params.maxCorrelation || 0.7, // 最大Correlation
      correlationPenaltyFactor: params.correlationPenaltyFactor || 0.5, // correlationPenaltyFactor
      correlationMatrix: params.correlationMatrix || { // correlationMatrix
        'SMA-MACD': 0.6,      // SMAMACD
        'SMA-RSI': 0.3,       // SMARSI
        'RSI-BollingerBands': 0.4, // RSI布林带Bands
      }, // 结束代码块

      // 熔断机制
      circuitBreaker: params.circuitBreaker !== false, // circuitBreaker
      consecutiveLossLimit: params.consecutiveLossLimit || 5, // consecutive亏损限制
      maxDrawdownLimit: params.maxDrawdownLimit || 0.15, // 最大回撤限制
      minWinRate: params.minWinRate || 0.3, // 最小Win频率
      evaluationWindow: params.evaluationWindow || 30, // evaluation窗口
      coolingPeriod: params.coolingPeriod || 3600000, // 冷却周期
      autoRecover: params.autoRecover !== false, // 自动Recover
    }; // 结束代码块

    // ============================================
    // 止盈止损
    // ============================================

    this.takeProfitPercent = params.takeProfitPercent || 3.0; // 设置 takeProfitPercent
    this.stopLossPercent = params.stopLossPercent || 1.5; // 设置 stopLossPercent

    // ============================================
    // 内部状态
    // ============================================

    this._weightSystem = null; // 设置 _weightSystem
    this._subStrategies = {}; // 设置 _subStrategies
    this._entryPrice = null; // 设置 _entryPrice
    this._lastTradeResult = null; // 设置 _lastTradeResult
    this._tradeHistory = []; // 设置 _tradeHistory
  } // 结束代码块

  /**
   * 初始化
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  async onInit(exchanges) { // 执行语句
    // 保存交易所引用，供子策略使用 / Save exchanges for sub-strategies
    this._exchanges = exchanges; // 设置 _exchanges

    await super.onInit(); // 等待异步结果

    // 初始化权重系统
    this._initWeightSystem(); // 调用 _initWeightSystem

    // 初始化子策略
    await this._initSubStrategies(); // 等待异步结果

    // 绑定权重系统事件
    this._bindWeightSystemEvents(); // 调用 _bindWeightSystemEvents

    this.log(`加权组合策略初始化完成`); // 调用 log
    this.log(`策略权重: ${JSON.stringify(this.strategyWeights)}`); // 调用 log
    this.log(`买入阈值: ${this.buyThreshold}, 卖出阈值: ${this.sellThreshold}`); // 调用 log
  } // 结束代码块

  /**
   * 初始化权重系统
   * @private
   */
  _initWeightSystem() { // 调用 _initWeightSystem
    this._weightSystem = new SignalWeightingSystem({ // 设置 _weightSystem
      threshold: this.buyThreshold, // 阈值
      sellThreshold: this.sellThreshold, // sell阈值
      baseWeights: this.strategyWeights, // baseWeights
      ...this.weightSystemConfig, // 展开对象或数组
    }); // 结束代码块

    // 注册所有策略
    for (const [name, weight] of Object.entries(this.strategyWeights)) { // 循环 const [name, weight] of Object.entries(this.s...
      this._weightSystem.registerStrategy(name, weight); // 访问 _weightSystem
    } // 结束代码块

    // 设置相关性矩阵
    if (this.weightSystemConfig.correlationMatrix) { // 条件判断 this.weightSystemConfig.correlationMatrix
      this._weightSystem.setCorrelationMatrix(this.weightSystemConfig.correlationMatrix); // 访问 _weightSystem
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化子策略
   * @private
   */
  async _initSubStrategies() { // 执行语句
    // 创建空操作 engine，防止子策略报 "引擎未设置" 错误
    // Create noop engine to prevent "Engine not set" errors in sub-strategies
    const noopEngine = { // 定义常量 noopEngine
      buy: () => null, // buy
      sell: () => null, // sell
      buyPercent: () => null, // buy百分比
      closePosition: () => null, // 收盘持仓
      getPosition: () => null, // get持仓
      getEquity: () => 0, // getEquity
      getAvailableBalance: () => 0, // getAvailable余额
    }; // 结束代码块

    for (const strategyName of Object.keys(this.strategyWeights)) { // 循环 const strategyName of Object.keys(this.strate...
      const StrategyClass = getStrategyClassMap()[strategyName]; // 定义常量 StrategyClass

      if (!StrategyClass) { // 条件判断 !StrategyClass
        this.log(`未知策略类型: ${strategyName}`, 'warn'); // 调用 log
        continue; // 继续下一轮循环
      } // 结束代码块

      try { // 尝试执行
        const params = { // 定义常量 params
          ...this.strategyParams[strategyName], // 展开对象或数组
          symbol: this.symbol, // 交易对
          positionPercent: this.positionPercent, // 持仓百分比
          // 禁止子策略自动交易
          autoTrade: false, // 禁止子策略自动交易
        }; // 结束代码块

        const strategy = new StrategyClass(params); // 定义常量 strategy

        // 设置空操作 engine，防止子策略报错但不实际执行交易
        // Set noop engine to prevent errors but not execute trades
        strategy.engine = noopEngine; // 赋值 strategy.engine

        // 传递交易所引用给子策略 / Pass exchanges to sub-strategy
        await strategy.onInit(this._exchanges); // 等待异步结果

        this._subStrategies[strategyName] = { // 访问 _subStrategies
          instance: strategy, // instance
          converter: SignalConverters[strategyName] || SignalConverters.default, // converter
        }; // 结束代码块

        this.log(`子策略 [${strategyName}] 初始化完成`); // 调用 log
      } catch (error) { // 执行语句
        this.log(`子策略 [${strategyName}] 初始化失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化 K 线历史数据 - 传递给所有子策略
   * Initialize candle history - pass to all sub-strategies
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} candles - 历史 K 线数据 / Historical candle data
   */
  initCandleHistory(symbol, candles) { // 调用 initCandleHistory
    // 调用父类方法 / Call parent method
    super.initCandleHistory(symbol, candles); // 调用父类

    // 传递给所有子策略 / Pass to all sub-strategies
    for (const [name, { instance }] of Object.entries(this._subStrategies)) { // 循环 const [name, { instance }] of Object.entries(...
      if (instance && typeof instance.initCandleHistory === 'function') { // 条件判断 instance && typeof instance.initCandleHistory...
        try { // 尝试执行
          instance.initCandleHistory(symbol, candles); // 调用 instance.initCandleHistory
        } catch (error) { // 执行语句
          this.log(`子策略 [${name}] 初始化历史数据失败: ${error.message}`, 'warn'); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 绑定权重系统事件
   * @private
   */
  _bindWeightSystemEvents() { // 调用 _bindWeightSystemEvents
    this._weightSystem.on('circuitBreak', (data) => { // 访问 _weightSystem
      this.log(`⚠️ 策略熔断: ${data.strategy}, 原因: ${data.reason}`, 'warn'); // 调用 log
      this.emit('strategyCircuitBreak', data); // 调用 emit
    }); // 结束代码块

    this._weightSystem.on('strategyRecovered', (data) => { // 访问 _weightSystem
      this.log(`✅ 策略恢复: ${data.strategy}`); // 调用 log
      this.emit('strategyRecovered', data); // 调用 emit
    }); // 结束代码块

    this._weightSystem.on('weightAdjusted', (data) => { // 访问 _weightSystem
      this.log(`📊 权重调整: ${data.strategy} ${data.oldWeight.toFixed(3)} → ${data.newWeight.toFixed(3)}`); // 调用 log
      this.emit('weightAdjusted', data); // 调用 emit
    }); // 结束代码块

    this._weightSystem.on('scoreCalculated', (data) => { // 访问 _weightSystem
      this.setIndicator('comboScore', data.score); // 调用 setIndicator
      this.setIndicator('buyScore', data.buyScore); // 调用 setIndicator
      this.setIndicator('sellScore', data.sellScore); // 调用 setIndicator
      this.setIndicator('action', data.action); // 调用 setIndicator
    }); // 结束代码块
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 清除上一轮信号
    this._weightSystem.clearCurrentSignals(); // 访问 _weightSystem

    // 1. 调用所有子策略并收集信号
    await this._collectSignals(candle, history); // 等待异步结果

    // 2. 计算综合得分
    const scoreResult = this._weightSystem.calculateScore(); // 定义常量 scoreResult

    // 保存指标
    this.setIndicator('comboScore', scoreResult.score); // 调用 setIndicator
    this.setIndicator('signals', scoreResult.signals); // 调用 setIndicator

    // 3. 检查止盈止损
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    if (hasPosition && this._entryPrice) { // 条件判断 hasPosition && this._entryPrice
      const pnlPercent = ((candle.close - this._entryPrice) / this._entryPrice) * 100; // 定义常量 pnlPercent

      if (pnlPercent >= this.takeProfitPercent) { // 条件判断 pnlPercent >= this.takeProfitPercent
        this.log(`🎯 止盈触发: ${pnlPercent.toFixed(2)}%`); // 调用 log
        this._executeExit(candle, `Take Profit (${pnlPercent.toFixed(2)}%)`); // 调用 _executeExit
        return; // 返回结果
      } // 结束代码块

      if (pnlPercent <= -this.stopLossPercent) { // 条件判断 pnlPercent <= -this.stopLossPercent
        this.log(`🛑 止损触发: ${pnlPercent.toFixed(2)}%`); // 调用 log
        this._executeExit(candle, `Stop Loss (${pnlPercent.toFixed(2)}%)`); // 调用 _executeExit
        return; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 4. 执行交易逻辑
    this._executeTrading(scoreResult, candle, hasPosition); // 调用 _executeTrading
  } // 结束代码块

  /**
   * 收集子策略信号
   * @private
   */
  async _collectSignals(candle, history) { // 执行语句
    for (const [strategyName, strategyData] of Object.entries(this._subStrategies)) { // 循环 const [strategyName, strategyData] of Object....
      try { // 尝试执行
        const { instance, converter } = strategyData; // 解构赋值

        // 调用子策略 onTick
        await instance.onTick(candle, history); // 等待异步结果

        // 转换信号为 0-1 得分
        const score = converter(instance, candle); // 定义常量 score

        // 记录到权重系统
        this._weightSystem.recordSignal(strategyName, score, { // 访问 _weightSystem
          price: candle.close, // 价格
          indicators: instance.indicators, // indicators
        }); // 结束代码块

      } catch (error) { // 执行语句
        this.log(`子策略 [${strategyName}] 执行错误: ${error.message}`, 'error'); // 调用 log
        // 出错时记录中性信号
        this._weightSystem.recordSignal(strategyName, 0.5); // 访问 _weightSystem
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行交易逻辑
   * @private
   */
  _executeTrading(scoreResult, candle, hasPosition) { // 调用 _executeTrading
    const { score, action, shouldTrade, signals } = scoreResult; // 解构赋值

    // 构建信号摘要
    const signalSummary = Object.entries(signals) // 定义常量 signalSummary
      .map(([name, data]) => `${name}:${data.rawScore.toFixed(2)}`) // 定义箭头函数
      .join(', '); // 执行语句

    // 调试日志: 每个tick输出当前得分 (每分钟输出一次，避免日志过多)
    const now = Date.now(); // 定义常量 now
    if (!this._lastScoreLogTime || now - this._lastScoreLogTime >= 60000) { // 条件判断 !this._lastScoreLogTime || now - this._lastSc...
      this._lastScoreLogTime = now; // 设置 _lastScoreLogTime
      const positionStatus = hasPosition ? '持仓中' : '空仓'; // 定义常量 positionStatus
      this.log(`[得分] ${score.toFixed(3)} | 买入>${this.buyThreshold} 卖出<${this.sellThreshold} | ${positionStatus} | ${signalSummary}`); // 调用 log
    } // 结束代码块

    if (action === 'buy' && !hasPosition) { // 条件判断 action === 'buy' && !hasPosition
      this.log(`📈 买入信号 | 总分: ${score.toFixed(3)} >= ${this.buyThreshold}`); // 调用 log
      this.log(`   明细: ${signalSummary}`); // 调用 log

      this.setBuySignal(`Weighted Score ${score.toFixed(3)}: ${signalSummary}`); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent

      this._entryPrice = candle.close; // 设置 _entryPrice
      this.setState('entryTime', Date.now()); // 调用 setState
      this.setState('entryScore', score); // 调用 setState

    } else if (action === 'sell' && hasPosition) { // 执行语句
      this.log(`📉 卖出信号 | 总分: ${score.toFixed(3)} <= ${this.sellThreshold}`); // 调用 log
      this.log(`   明细: ${signalSummary}`); // 调用 log

      this._executeExit(candle, `Weighted Score ${score.toFixed(3)}: ${signalSummary}`); // 调用 _executeExit
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行平仓
   * @private
   */
  _executeExit(candle, reason) { // 调用 _executeExit
    // 计算盈亏
    const pnl = this._entryPrice // 定义常量 pnl
      ? (candle.close - this._entryPrice) / this._entryPrice // 执行语句
      : 0; // 执行语句
    const win = pnl > 0; // 定义常量 win

    // 更新各策略表现
    for (const strategyName of Object.keys(this.strategyWeights)) { // 循环 const strategyName of Object.keys(this.strate...
      this._weightSystem.updatePerformance(strategyName, { // 访问 _weightSystem
        profit: pnl, // 盈利
        win, // 执行语句
        entryPrice: this._entryPrice, // 入场价格
        exitPrice: candle.close, // 出场价格
      }); // 结束代码块
    } // 结束代码块

    // 记录交易历史
    this._tradeHistory.push({ // 访问 _tradeHistory
      entryPrice: this._entryPrice, // 入场价格
      exitPrice: candle.close, // 出场价格
      pnl, // 执行语句
      win, // 执行语句
      reason, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 执行平仓
    this.setSellSignal(reason); // 调用 setSellSignal
    this.closePosition(this.symbol); // 调用 closePosition

    this._lastTradeResult = { pnl, win, reason }; // 设置 _lastTradeResult
    this._entryPrice = null; // 设置 _entryPrice
  } // 结束代码块

  /**
   * 策略结束
   */
  async onFinish() { // 执行语句
    // 清理子策略
    for (const [name, data] of Object.entries(this._subStrategies)) { // 循环 const [name, data] of Object.entries(this._su...
      try { // 尝试执行
        await data.instance.onFinish(); // 等待异步结果
      } catch (e) { // 执行语句
        this.log(`子策略 [${name}] 清理失败: ${e.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 打印统计
    this._printStats(); // 调用 _printStats

    await super.onFinish(); // 等待异步结果
  } // 结束代码块

  /**
   * 打印统计信息
   * @private
   */
  _printStats() { // 调用 _printStats
    const summary = this._weightSystem.getSummary(); // 定义常量 summary
    const allStatus = this._weightSystem.getAllStatus(); // 定义常量 allStatus

    this.log('='.repeat(50)); // 调用 log
    this.log('加权组合策略统计'); // 调用 log
    this.log('='.repeat(50)); // 调用 log

    // 权重系统摘要
    this.log(`总策略数: ${summary.totalStrategies}`); // 调用 log
    this.log(`活跃策略: ${summary.activeStrategies}`); // 调用 log
    this.log(`熔断策略: ${summary.circuitBrokenStrategies}`); // 调用 log

    // 各策略表现
    this.log('-'.repeat(50)); // 调用 log
    this.log('各策略表现:'); // 调用 log

    for (const [name, status] of Object.entries(allStatus)) { // 循环 const [name, status] of Object.entries(allSta...
      const perf = status.performance; // 定义常量 perf
      const winRate = perf.trades > 0 ? (perf.wins / perf.trades * 100).toFixed(1) : 'N/A'; // 定义常量 winRate

      this.log(`  ${name}:`); // 调用 log
      this.log(`    权重: ${status.baseWeight.toFixed(2)} → ${status.weight.toFixed(2)}`); // 调用 log
      this.log(`    状态: ${status.status}`); // 调用 log
      this.log(`    交易: ${perf.trades}, 胜率: ${winRate}%`); // 调用 log
      this.log(`    最大回撤: ${(perf.maxDrawdown * 100).toFixed(2)}%`); // 调用 log
    } // 结束代码块

    // 交易统计
    if (this._tradeHistory.length > 0) { // 条件判断 this._tradeHistory.length > 0
      const wins = this._tradeHistory.filter(t => t.win).length; // 定义函数 wins
      const totalPnL = this._tradeHistory.reduce((acc, t) => acc + t.pnl, 0); // 定义函数 totalPnL

      this.log('-'.repeat(50)); // 调用 log
      this.log('组合交易统计:'); // 调用 log
      this.log(`  总交易: ${this._tradeHistory.length}`); // 调用 log
      this.log(`  胜率: ${(wins / this._tradeHistory.length * 100).toFixed(1)}%`); // 调用 log
      this.log(`  总收益: ${(totalPnL * 100).toFixed(2)}%`); // 调用 log
    } // 结束代码块

    this.log('='.repeat(50)); // 调用 log
  } // 结束代码块

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取权重系统
   * @returns {SignalWeightingSystem}
   */
  getWeightSystem() { // 调用 getWeightSystem
    return this._weightSystem; // 返回结果
  } // 结束代码块

  /**
   * 获取当前权重
   * @returns {Object}
   */
  getWeights() { // 调用 getWeights
    return this._weightSystem.getWeights(); // 返回结果
  } // 结束代码块

  /**
   * 获取策略状态
   * @returns {Object}
   */
  getStrategiesStatus() { // 调用 getStrategiesStatus
    return this._weightSystem.getAllStatus(); // 返回结果
  } // 结束代码块

  /**
   * 手动触发策略熔断
   * @param {string} strategy - 策略名称
   */
  circuitBreakStrategy(strategy) { // 调用 circuitBreakStrategy
    this._weightSystem.circuitBreak(strategy); // 访问 _weightSystem
  } // 结束代码块

  /**
   * 手动恢复策略
   * @param {string} strategy - 策略名称
   */
  recoverStrategy(strategy) { // 调用 recoverStrategy
    this._weightSystem.recoverStrategy(strategy); // 访问 _weightSystem
  } // 结束代码块

  /**
   * 重新计算相关性矩阵
   */
  recalculateCorrelation() { // 调用 recalculateCorrelation
    return this._weightSystem.calculateSignalCorrelation(); // 返回结果
  } // 结束代码块

  /**
   * 更新交易阈值
   * @param {number} buyThreshold - 买入阈值
   * @param {number} sellThreshold - 卖出阈值
   */
  setThresholds(buyThreshold, sellThreshold) { // 调用 setThresholds
    this.buyThreshold = buyThreshold; // 设置 buyThreshold
    this.sellThreshold = sellThreshold; // 设置 sellThreshold
    this._weightSystem.setThresholds(buyThreshold, sellThreshold); // 访问 _weightSystem
  } // 结束代码块

  /**
   * 获取最近得分历史
   * @param {number} limit - 返回数量
   */
  getScoreHistory(limit = 10) { // 调用 getScoreHistory
    return this._weightSystem.getScoreHistory(limit); // 返回结果
  } // 结束代码块

  /**
   * 获取交易历史
   */
  getTradeHistory() { // 调用 getTradeHistory
    return [...this._tradeHistory]; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出
export { SignalWeightingSystem, StrategyStatus }; // 导出命名成员
export default WeightedComboStrategy; // 默认导出
