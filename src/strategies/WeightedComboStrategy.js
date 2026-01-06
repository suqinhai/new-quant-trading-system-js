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

import { BaseStrategy } from './BaseStrategy.js';
import { SignalWeightingSystem, StrategyStatus } from './SignalWeightingSystem.js';

// 子策略导入 - 基础策略
import { SMAStrategy } from './SMAStrategy.js';
import { RSIStrategy } from './RSIStrategy.js';
import { MACDStrategy } from './MACDStrategy.js';
import { BollingerBandsStrategy } from './BollingerBandsStrategy.js';
import { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js';
import { FundingArbStrategy } from './FundingArbStrategy.js';

// 子策略导入 - 波动率策略
import { BollingerWidthStrategy } from './BollingerWidthStrategy.js';
import { VolatilityRegimeStrategy } from './VolatilityRegimeStrategy.js';

// 子策略导入 - 高级策略
import { GridStrategy } from './GridStrategy.js';
import { OrderFlowStrategy } from './OrderFlowStrategy.js';
import { MultiTimeframeStrategy } from './MultiTimeframeStrategy.js';
import { RegimeSwitchingStrategy } from './RegimeSwitchingStrategy.js';
import { AdaptiveStrategy } from './AdaptiveStrategy.js';
import { RiskDrivenStrategy } from './RiskDrivenStrategy.js';

// 子策略导入 - 横截面策略
import { CrossSectionalStrategy } from './CrossSectionalStrategy.js';
import { MomentumRankStrategy } from './MomentumRankStrategy.js';
import { RotationStrategy } from './RotationStrategy.js';
import { FundingRateExtremeStrategy } from './FundingRateExtremeStrategy.js';
import { CrossExchangeSpreadStrategy } from './CrossExchangeSpreadStrategy.js';
import { StatisticalArbitrageStrategy } from './StatisticalArbitrageStrategy.js';

/**
 * 策略类映射
 * Strategy Class Map
 *
 * 包含所有可用的子策略类
 * Contains all available sub-strategy classes
 */
const STRATEGY_CLASS_MAP = {
  // 基础趋势策略 / Basic trend strategies
  SMA: SMAStrategy,
  RSI: RSIStrategy,
  MACD: MACDStrategy,
  BollingerBands: BollingerBandsStrategy,
  ATRBreakout: ATRBreakoutStrategy,

  // 资金费率策略 / Funding rate strategies
  FundingRate: FundingArbStrategy,
  FundingArb: FundingArbStrategy,
  FundingRateExtreme: FundingRateExtremeStrategy,

  // 波动率策略 / Volatility strategies
  BollingerWidth: BollingerWidthStrategy,
  VolatilityRegime: VolatilityRegimeStrategy,

  // 网格与订单流策略 / Grid and order flow strategies
  Grid: GridStrategy,
  OrderFlow: OrderFlowStrategy,

  // 多周期与自适应策略 / Multi-timeframe and adaptive strategies
  MultiTimeframe: MultiTimeframeStrategy,
  MTF: MultiTimeframeStrategy,
  RegimeSwitching: RegimeSwitchingStrategy,
  Adaptive: AdaptiveStrategy,

  // 风控驱动策略 / Risk-driven strategies
  RiskDriven: RiskDrivenStrategy,

  // 横截面策略 / Cross-sectional strategies
  CrossSectional: CrossSectionalStrategy,
  MomentumRank: MomentumRankStrategy,
  Momentum: MomentumRankStrategy,
  Rotation: RotationStrategy,

  // 套利策略 / Arbitrage strategies
  CrossExchangeSpread: CrossExchangeSpreadStrategy,
  CrossExchange: CrossExchangeSpreadStrategy,
  StatisticalArbitrage: StatisticalArbitrageStrategy,
  StatArb: StatisticalArbitrageStrategy,
};

/**
 * 信号转换器: 将各种策略信号转换为 0-1 得分
 */
const SignalConverters = {
  /**
   * SMA 策略信号转换
   * 基于均线距离计算得分
   */
  SMA: (strategy, candle) => {
    const shortMA = strategy.getIndicator('shortMA');
    const longMA = strategy.getIndicator('longMA');

    if (!shortMA || !longMA) return 0.5;

    // 计算均线差距百分比
    const diff = (shortMA - longMA) / longMA;

    // 转换为 0-1 得分
    // diff > 0 看多, diff < 0 看空
    // 使用 sigmoid 函数平滑转换
    const score = 1 / (1 + Math.exp(-diff * 100));

    return score;
  },

  /**
   * RSI 策略信号转换
   * RSI < 30 → 1.0 (强烈看多)
   * RSI = 50 → 0.5 (中性)
   * RSI > 70 → 0.0 (强烈看空)
   */
  RSI: (strategy, candle) => {
    const rsi = strategy.getIndicator('rsi');

    if (rsi === undefined || rsi === null) return 0.5;

    // 反转 RSI: 低 RSI = 高得分 (买入信号)
    const score = (100 - rsi) / 100;

    return Math.max(0, Math.min(1, score));
  },

  /**
   * MACD 策略信号转换
   * 柱状图 > 0 看多, < 0 看空
   */
  MACD: (strategy, candle) => {
    const histogram = strategy.getIndicator('histogram');

    if (histogram === undefined || histogram === null) return 0.5;

    // 归一化柱状图值
    const normalized = histogram / (Math.abs(histogram) + 0.001);

    // 转换为 0-1
    const score = (normalized + 1) / 2;

    return Math.max(0, Math.min(1, score));
  },

  /**
   * 布林带策略信号转换
   * 价格在下轨附近 → 看多
   * 价格在上轨附近 → 看空
   */
  BollingerBands: (strategy, candle) => {
    const upper = strategy.getIndicator('upper');
    const lower = strategy.getIndicator('lower');
    const middle = strategy.getIndicator('middle');

    if (!upper || !lower || !middle) return 0.5;

    const price = candle.close;
    const range = upper - lower;

    if (range <= 0) return 0.5;

    // 计算价格在布林带中的位置
    const position = (price - lower) / range;

    // 反转: 接近下轨 = 高得分 (买入)
    const score = 1 - position;

    return Math.max(0, Math.min(1, score));
  },

  /**
   * ATR 突破策略信号转换
   */
  ATRBreakout: (strategy, candle) => {
    const breakoutSignal = strategy.getIndicator('breakout');
    const atrPercent = strategy.getIndicator('atrPercent');

    if (breakoutSignal === undefined) return 0.5;

    // 1 = 上轨突破 (看多), -1 = 下轨突破 (看空), 0 = 无突破
    if (breakoutSignal === 1) return 0.8;
    if (breakoutSignal === -1) return 0.2;

    return 0.5;
  },

  /**
   * 资金费率策略信号转换
   * 负费率 → 看多 (做多有利)
   * 正费率 → 看空 (做空有利)
   */
  FundingRate: (strategy, candle) => {
    const fundingRate = strategy.getIndicator('fundingRate');

    if (fundingRate === undefined || fundingRate === null) return 0.5;

    // 费率通常在 -0.1% 到 0.1% 之间
    // 转换为 0-1 得分
    const normalized = -fundingRate * 1000; // 放大 1000 倍

    // sigmoid 转换
    const score = 1 / (1 + Math.exp(-normalized));

    return Math.max(0, Math.min(1, score));
  },

  /**
   * 布林带宽度策略信号转换
   * 带宽收窄 → 即将突破，准备入场
   */
  BollingerWidth: (strategy, candle) => {
    const width = strategy.getIndicator('width');
    const avgWidth = strategy.getIndicator('avgWidth');
    const squeeze = strategy.getIndicator('squeeze');

    if (squeeze) return 0.7; // 挤压状态，准备突破
    if (width !== undefined && avgWidth !== undefined) {
      // 带宽低于平均值越多，得分越高
      const ratio = width / avgWidth;
      if (ratio < 0.8) return 0.75;
      if (ratio < 1.0) return 0.6;
    }
    return 0.5;
  },

  /**
   * 波动率状态策略信号转换
   */
  VolatilityRegime: (strategy, candle) => {
    const regime = strategy.getIndicator('regime');
    const signal = strategy.getSignal();

    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;

    // 根据波动率状态调整
    if (regime === 'low') return 0.6;  // 低波动，可能突破
    if (regime === 'high') return 0.4; // 高波动，谨慎
    return 0.5;
  },

  /**
   * 网格策略信号转换
   */
  Grid: (strategy, candle) => {
    const gridLevel = strategy.getIndicator('gridLevel');
    const signal = strategy.getSignal();

    if (signal?.type === 'buy') return 0.75;
    if (signal?.type === 'sell') return 0.25;
    return 0.5;
  },

  /**
   * 订单流策略信号转换
   * 基于买卖压力
   */
  OrderFlow: (strategy, candle) => {
    const buyPressure = strategy.getIndicator('buyPressure');
    const sellPressure = strategy.getIndicator('sellPressure');
    const imbalance = strategy.getIndicator('imbalance');

    if (imbalance !== undefined) {
      // imbalance > 0 表示买压大于卖压
      const score = 0.5 + (imbalance * 0.3);
      return Math.max(0, Math.min(1, score));
    }

    if (buyPressure !== undefined && sellPressure !== undefined) {
      const total = buyPressure + sellPressure;
      if (total > 0) {
        return buyPressure / total;
      }
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.75;
    if (signal?.type === 'sell') return 0.25;
    return 0.5;
  },

  /**
   * 多周期共振策略信号转换
   */
  MultiTimeframe: (strategy, candle) => {
    const alignment = strategy.getIndicator('alignment');
    const strength = strategy.getIndicator('strength');

    if (alignment !== undefined) {
      // alignment: 1 = 全部看多, -1 = 全部看空, 0 = 混合
      const score = (alignment + 1) / 2;
      // 结合强度调整
      if (strength !== undefined) {
        return score * 0.7 + strength * 0.3;
      }
      return score;
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * Regime 切换策略信号转换
   */
  RegimeSwitching: (strategy, candle) => {
    const regime = strategy.getIndicator('regime');
    const confidence = strategy.getIndicator('confidence') || 0.5;

    // 根据市场状态调整
    if (regime === 'trending_up') return 0.5 + (confidence * 0.4);
    if (regime === 'trending_down') return 0.5 - (confidence * 0.4);
    if (regime === 'ranging') return 0.5;

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.75;
    if (signal?.type === 'sell') return 0.25;
    return 0.5;
  },

  /**
   * 自适应策略信号转换
   */
  Adaptive: (strategy, candle) => {
    const adaptiveScore = strategy.getIndicator('adaptiveScore');
    if (adaptiveScore !== undefined) {
      return Math.max(0, Math.min(1, adaptiveScore));
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * 风控驱动策略信号转换
   */
  RiskDriven: (strategy, candle) => {
    const riskScore = strategy.getIndicator('riskScore');
    const signal = strategy.getSignal();

    // 风险分数越低越好
    if (riskScore !== undefined) {
      const safetyScore = 1 - riskScore;
      if (signal?.type === 'buy') return 0.5 + (safetyScore * 0.4);
      if (signal?.type === 'sell') return 0.5 - (safetyScore * 0.4);
      return 0.5;
    }

    if (signal?.type === 'buy') return 0.7;
    if (signal?.type === 'sell') return 0.3;
    return 0.5;
  },

  /**
   * 横截面策略信号转换
   */
  CrossSectional: (strategy, candle) => {
    const rank = strategy.getIndicator('rank');
    const totalAssets = strategy.getIndicator('totalAssets') || 10;

    if (rank !== undefined && totalAssets > 0) {
      // rank 1 = 最强 (买入), rank = totalAssets = 最弱 (卖出)
      const score = 1 - ((rank - 1) / (totalAssets - 1));
      return Math.max(0, Math.min(1, score));
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * 动量排名策略信号转换
   */
  MomentumRank: (strategy, candle) => {
    const momentum = strategy.getIndicator('momentum');
    const rank = strategy.getIndicator('rank');

    if (momentum !== undefined) {
      // 正动量 → 看多, 负动量 → 看空
      const score = 1 / (1 + Math.exp(-momentum * 10));
      return score;
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * 轮动策略信号转换
   */
  Rotation: (strategy, candle) => {
    const strength = strategy.getIndicator('strength');
    const isLeader = strategy.getIndicator('isLeader');

    if (isLeader) return 0.85;
    if (strength !== undefined) {
      // strength 通常在 -1 到 1 之间
      return (strength + 1) / 2;
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * 资金费率极值策略信号转换
   */
  FundingRateExtreme: (strategy, candle) => {
    const fundingRate = strategy.getIndicator('fundingRate');
    const isExtreme = strategy.getIndicator('isExtreme');
    const extremeType = strategy.getIndicator('extremeType');

    if (isExtreme) {
      // 极端负费率 → 强烈看多, 极端正费率 → 强烈看空
      if (extremeType === 'negative') return 0.9;
      if (extremeType === 'positive') return 0.1;
    }

    if (fundingRate !== undefined) {
      const normalized = -fundingRate * 1000;
      return 1 / (1 + Math.exp(-normalized));
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  /**
   * 跨交易所价差策略信号转换
   */
  CrossExchangeSpread: (strategy, candle) => {
    const spread = strategy.getIndicator('spread');
    const threshold = strategy.getIndicator('threshold') || 0.001;

    if (spread !== undefined) {
      // 价差超过阈值 → 套利机会
      if (Math.abs(spread) > threshold) {
        return spread > 0 ? 0.8 : 0.2;
      }
    }

    const signal = strategy.getSignal();
    if (signal?.type === 'buy') return 0.75;
    if (signal?.type === 'sell') return 0.25;
    return 0.5;
  },

  /**
   * 统计套利策略信号转换
   */
  StatisticalArbitrage: (strategy, candle) => {
    const zscore = strategy.getIndicator('zscore');
    const signal = strategy.getSignal();

    if (zscore !== undefined) {
      // z-score > 2 → 做空, z-score < -2 → 做多
      if (zscore < -2) return 0.85;
      if (zscore > 2) return 0.15;
      // 线性插值
      const score = 0.5 - (zscore / 4) * 0.35;
      return Math.max(0.15, Math.min(0.85, score));
    }

    if (signal?.type === 'buy') return 0.8;
    if (signal?.type === 'sell') return 0.2;
    return 0.5;
  },

  // 别名映射到相同的转换器
  FundingArb: (strategy, candle) => SignalConverters.FundingRate(strategy, candle),
  MTF: (strategy, candle) => SignalConverters.MultiTimeframe(strategy, candle),
  Momentum: (strategy, candle) => SignalConverters.MomentumRank(strategy, candle),
  CrossExchange: (strategy, candle) => SignalConverters.CrossExchangeSpread(strategy, candle),
  StatArb: (strategy, candle) => SignalConverters.StatisticalArbitrage(strategy, candle),

  /**
   * 默认转换器: 基于策略信号状态
   */
  default: (strategy, candle) => {
    const signal = strategy.getSignal();

    if (!signal) return 0.5;

    if (signal.type === 'buy') return 0.8;
    if (signal.type === 'sell') return 0.2;

    return 0.5;
  },
};

/**
 * 加权组合策略类
 */
export class WeightedComboStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'WeightedComboStrategy',
      ...params,
    });

    // ============================================
    // 基础配置
    // ============================================

    // 交易对
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比
    this.positionPercent = params.positionPercent || 95;

    // ============================================
    // 策略权重配置
    // ============================================

    // 策略权重配置 { name: weight }
    // 示例: { SMA: 0.4, RSI: 0.2, FundingRate: 0.4 }
    this.strategyWeights = params.strategyWeights || {
      SMA: 0.4,
      RSI: 0.2,
      MACD: 0.4,
    };

    // 交易阈值: 总分 >= threshold 买入
    this.buyThreshold = params.buyThreshold || 0.7;

    // 卖出阈值: 总分 <= threshold 卖出
    this.sellThreshold = params.sellThreshold || 0.3;

    // ============================================
    // 子策略参数
    // ============================================

    this.strategyParams = {
      SMA: params.smaParams || { shortPeriod: 10, longPeriod: 30 },
      RSI: params.rsiParams || { period: 14, overbought: 70, oversold: 30 },
      MACD: params.macdParams || { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      BollingerBands: params.bbParams || { period: 20, stdDev: 2 },
      ATRBreakout: params.atrParams || { period: 14, multiplier: 2 },
      FundingRate: params.fundingParams || {},
      ...params.customStrategyParams,
    };

    // ============================================
    // 权重系统配置
    // ============================================

    this.weightSystemConfig = {
      // 动态权重
      dynamicWeights: params.dynamicWeights !== false,
      adjustmentFactor: params.adjustmentFactor || 0.2,
      evaluationPeriod: params.evaluationPeriod || 20,
      minWeight: params.minWeight || 0.05,
      maxWeight: params.maxWeight || 0.6,

      // 相关性限制
      correlationLimit: params.correlationLimit !== false,
      maxCorrelation: params.maxCorrelation || 0.7,
      correlationPenaltyFactor: params.correlationPenaltyFactor || 0.5,
      correlationMatrix: params.correlationMatrix || {
        'SMA-MACD': 0.6,      // SMA 和 MACD 相关性较高
        'SMA-RSI': 0.3,       // SMA 和 RSI 相关性中等
        'RSI-BollingerBands': 0.4, // RSI 和布林带相关性中等
      },

      // 熔断机制
      circuitBreaker: params.circuitBreaker !== false,
      consecutiveLossLimit: params.consecutiveLossLimit || 5,
      maxDrawdownLimit: params.maxDrawdownLimit || 0.15,
      minWinRate: params.minWinRate || 0.3,
      evaluationWindow: params.evaluationWindow || 30,
      coolingPeriod: params.coolingPeriod || 3600000, // 1 小时
      autoRecover: params.autoRecover !== false,
    };

    // ============================================
    // 止盈止损
    // ============================================

    this.takeProfitPercent = params.takeProfitPercent || 3.0;
    this.stopLossPercent = params.stopLossPercent || 1.5;

    // ============================================
    // 内部状态
    // ============================================

    this._weightSystem = null;
    this._subStrategies = {};
    this._entryPrice = null;
    this._lastTradeResult = null;
    this._tradeHistory = [];
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    // 初始化权重系统
    this._initWeightSystem();

    // 初始化子策略
    await this._initSubStrategies();

    // 绑定权重系统事件
    this._bindWeightSystemEvents();

    this.log(`加权组合策略初始化完成`);
    this.log(`策略权重: ${JSON.stringify(this.strategyWeights)}`);
    this.log(`买入阈值: ${this.buyThreshold}, 卖出阈值: ${this.sellThreshold}`);
  }

  /**
   * 初始化权重系统
   * @private
   */
  _initWeightSystem() {
    this._weightSystem = new SignalWeightingSystem({
      threshold: this.buyThreshold,
      sellThreshold: this.sellThreshold,
      baseWeights: this.strategyWeights,
      ...this.weightSystemConfig,
    });

    // 注册所有策略
    for (const [name, weight] of Object.entries(this.strategyWeights)) {
      this._weightSystem.registerStrategy(name, weight);
    }

    // 设置相关性矩阵
    if (this.weightSystemConfig.correlationMatrix) {
      this._weightSystem.setCorrelationMatrix(this.weightSystemConfig.correlationMatrix);
    }
  }

  /**
   * 初始化子策略
   * @private
   */
  async _initSubStrategies() {
    // 创建空操作 engine，防止子策略报 "引擎未设置" 错误
    // Create noop engine to prevent "Engine not set" errors in sub-strategies
    const noopEngine = {
      buy: () => null,
      sell: () => null,
      buyPercent: () => null,
      closePosition: () => null,
      getPosition: () => null,
      getEquity: () => 0,
      getAvailableBalance: () => 0,
    };

    for (const strategyName of Object.keys(this.strategyWeights)) {
      const StrategyClass = STRATEGY_CLASS_MAP[strategyName];

      if (!StrategyClass) {
        this.log(`未知策略类型: ${strategyName}`, 'warn');
        continue;
      }

      try {
        const params = {
          ...this.strategyParams[strategyName],
          symbol: this.symbol,
          positionPercent: this.positionPercent,
          // 禁止子策略自动交易
          autoTrade: false,
        };

        const strategy = new StrategyClass(params);

        // 设置空操作 engine，防止子策略报错但不实际执行交易
        // Set noop engine to prevent errors but not execute trades
        strategy.engine = noopEngine;

        await strategy.onInit();

        this._subStrategies[strategyName] = {
          instance: strategy,
          converter: SignalConverters[strategyName] || SignalConverters.default,
        };

        this.log(`子策略 [${strategyName}] 初始化完成`);
      } catch (error) {
        this.log(`子策略 [${strategyName}] 初始化失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 绑定权重系统事件
   * @private
   */
  _bindWeightSystemEvents() {
    this._weightSystem.on('circuitBreak', (data) => {
      this.log(`⚠️ 策略熔断: ${data.strategy}, 原因: ${data.reason}`, 'warn');
      this.emit('strategyCircuitBreak', data);
    });

    this._weightSystem.on('strategyRecovered', (data) => {
      this.log(`✅ 策略恢复: ${data.strategy}`);
      this.emit('strategyRecovered', data);
    });

    this._weightSystem.on('weightAdjusted', (data) => {
      this.log(`📊 权重调整: ${data.strategy} ${data.oldWeight.toFixed(3)} → ${data.newWeight.toFixed(3)}`);
      this.emit('weightAdjusted', data);
    });

    this._weightSystem.on('scoreCalculated', (data) => {
      this.setIndicator('comboScore', data.score);
      this.setIndicator('buyScore', data.buyScore);
      this.setIndicator('sellScore', data.sellScore);
      this.setIndicator('action', data.action);
    });
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 清除上一轮信号
    this._weightSystem.clearCurrentSignals();

    // 1. 调用所有子策略并收集信号
    await this._collectSignals(candle, history);

    // 2. 计算综合得分
    const scoreResult = this._weightSystem.calculateScore();

    // 保存指标
    this.setIndicator('comboScore', scoreResult.score);
    this.setIndicator('signals', scoreResult.signals);

    // 3. 检查止盈止损
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    if (hasPosition && this._entryPrice) {
      const pnlPercent = ((candle.close - this._entryPrice) / this._entryPrice) * 100;

      if (pnlPercent >= this.takeProfitPercent) {
        this.log(`🎯 止盈触发: ${pnlPercent.toFixed(2)}%`);
        this._executeExit(candle, `Take Profit (${pnlPercent.toFixed(2)}%)`);
        return;
      }

      if (pnlPercent <= -this.stopLossPercent) {
        this.log(`🛑 止损触发: ${pnlPercent.toFixed(2)}%`);
        this._executeExit(candle, `Stop Loss (${pnlPercent.toFixed(2)}%)`);
        return;
      }
    }

    // 4. 执行交易逻辑
    this._executeTrading(scoreResult, candle, hasPosition);
  }

  /**
   * 收集子策略信号
   * @private
   */
  async _collectSignals(candle, history) {
    for (const [strategyName, strategyData] of Object.entries(this._subStrategies)) {
      try {
        const { instance, converter } = strategyData;

        // 调用子策略 onTick
        await instance.onTick(candle, history);

        // 转换信号为 0-1 得分
        const score = converter(instance, candle);

        // 记录到权重系统
        this._weightSystem.recordSignal(strategyName, score, {
          price: candle.close,
          indicators: instance.indicators,
        });

      } catch (error) {
        this.log(`子策略 [${strategyName}] 执行错误: ${error.message}`, 'error');
        // 出错时记录中性信号
        this._weightSystem.recordSignal(strategyName, 0.5);
      }
    }
  }

  /**
   * 执行交易逻辑
   * @private
   */
  _executeTrading(scoreResult, candle, hasPosition) {
    const { score, action, shouldTrade, signals } = scoreResult;

    // 构建信号摘要
    const signalSummary = Object.entries(signals)
      .map(([name, data]) => `${name}:${data.rawScore.toFixed(2)}`)
      .join(', ');

    if (action === 'buy' && !hasPosition) {
      this.log(`📈 买入信号 | 总分: ${score.toFixed(3)} >= ${this.buyThreshold}`);
      this.log(`   明细: ${signalSummary}`);

      this.setBuySignal(`Weighted Score ${score.toFixed(3)}: ${signalSummary}`);
      this.buyPercent(this.symbol, this.positionPercent);

      this._entryPrice = candle.close;
      this.setState('entryTime', Date.now());
      this.setState('entryScore', score);

    } else if (action === 'sell' && hasPosition) {
      this.log(`📉 卖出信号 | 总分: ${score.toFixed(3)} <= ${this.sellThreshold}`);
      this.log(`   明细: ${signalSummary}`);

      this._executeExit(candle, `Weighted Score ${score.toFixed(3)}: ${signalSummary}`);
    }
  }

  /**
   * 执行平仓
   * @private
   */
  _executeExit(candle, reason) {
    // 计算盈亏
    const pnl = this._entryPrice
      ? (candle.close - this._entryPrice) / this._entryPrice
      : 0;
    const win = pnl > 0;

    // 更新各策略表现
    for (const strategyName of Object.keys(this.strategyWeights)) {
      this._weightSystem.updatePerformance(strategyName, {
        profit: pnl,
        win,
        entryPrice: this._entryPrice,
        exitPrice: candle.close,
      });
    }

    // 记录交易历史
    this._tradeHistory.push({
      entryPrice: this._entryPrice,
      exitPrice: candle.close,
      pnl,
      win,
      reason,
      timestamp: Date.now(),
    });

    // 执行平仓
    this.setSellSignal(reason);
    this.closePosition(this.symbol);

    this._lastTradeResult = { pnl, win, reason };
    this._entryPrice = null;
  }

  /**
   * 策略结束
   */
  async onFinish() {
    // 清理子策略
    for (const [name, data] of Object.entries(this._subStrategies)) {
      try {
        await data.instance.onFinish();
      } catch (e) {
        this.log(`子策略 [${name}] 清理失败: ${e.message}`, 'error');
      }
    }

    // 打印统计
    this._printStats();

    await super.onFinish();
  }

  /**
   * 打印统计信息
   * @private
   */
  _printStats() {
    const summary = this._weightSystem.getSummary();
    const allStatus = this._weightSystem.getAllStatus();

    this.log('='.repeat(50));
    this.log('加权组合策略统计');
    this.log('='.repeat(50));

    // 权重系统摘要
    this.log(`总策略数: ${summary.totalStrategies}`);
    this.log(`活跃策略: ${summary.activeStrategies}`);
    this.log(`熔断策略: ${summary.circuitBrokenStrategies}`);

    // 各策略表现
    this.log('-'.repeat(50));
    this.log('各策略表现:');

    for (const [name, status] of Object.entries(allStatus)) {
      const perf = status.performance;
      const winRate = perf.trades > 0 ? (perf.wins / perf.trades * 100).toFixed(1) : 'N/A';

      this.log(`  ${name}:`);
      this.log(`    权重: ${status.baseWeight.toFixed(2)} → ${status.weight.toFixed(2)}`);
      this.log(`    状态: ${status.status}`);
      this.log(`    交易: ${perf.trades}, 胜率: ${winRate}%`);
      this.log(`    最大回撤: ${(perf.maxDrawdown * 100).toFixed(2)}%`);
    }

    // 交易统计
    if (this._tradeHistory.length > 0) {
      const wins = this._tradeHistory.filter(t => t.win).length;
      const totalPnL = this._tradeHistory.reduce((acc, t) => acc + t.pnl, 0);

      this.log('-'.repeat(50));
      this.log('组合交易统计:');
      this.log(`  总交易: ${this._tradeHistory.length}`);
      this.log(`  胜率: ${(wins / this._tradeHistory.length * 100).toFixed(1)}%`);
      this.log(`  总收益: ${(totalPnL * 100).toFixed(2)}%`);
    }

    this.log('='.repeat(50));
  }

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取权重系统
   * @returns {SignalWeightingSystem}
   */
  getWeightSystem() {
    return this._weightSystem;
  }

  /**
   * 获取当前权重
   * @returns {Object}
   */
  getWeights() {
    return this._weightSystem.getWeights();
  }

  /**
   * 获取策略状态
   * @returns {Object}
   */
  getStrategiesStatus() {
    return this._weightSystem.getAllStatus();
  }

  /**
   * 手动触发策略熔断
   * @param {string} strategy - 策略名称
   */
  circuitBreakStrategy(strategy) {
    this._weightSystem.circuitBreak(strategy);
  }

  /**
   * 手动恢复策略
   * @param {string} strategy - 策略名称
   */
  recoverStrategy(strategy) {
    this._weightSystem.recoverStrategy(strategy);
  }

  /**
   * 重新计算相关性矩阵
   */
  recalculateCorrelation() {
    return this._weightSystem.calculateSignalCorrelation();
  }

  /**
   * 更新交易阈值
   * @param {number} buyThreshold - 买入阈值
   * @param {number} sellThreshold - 卖出阈值
   */
  setThresholds(buyThreshold, sellThreshold) {
    this.buyThreshold = buyThreshold;
    this.sellThreshold = sellThreshold;
    this._weightSystem.setThresholds(buyThreshold, sellThreshold);
  }

  /**
   * 获取最近得分历史
   * @param {number} limit - 返回数量
   */
  getScoreHistory(limit = 10) {
    return this._weightSystem.getScoreHistory(limit);
  }

  /**
   * 获取交易历史
   */
  getTradeHistory() {
    return [...this._tradeHistory];
  }
}

// 导出
export { SignalWeightingSystem, StrategyStatus };
export default WeightedComboStrategy;
