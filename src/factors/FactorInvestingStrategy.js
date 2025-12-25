/**
 * 因子投资策略
 * Factor Investing Strategy
 *
 * 基于 Alpha 因子库的多因子投资策略
 * Multi-factor investing strategy based on Alpha Factor Library
 *
 * 核心功能:
 * - 多因子打分排名
 * - Top N / Bottom N 选股
 * - 支持多空策略
 * - 定期再平衡
 */

import { BaseStrategy } from '../strategies/BaseStrategy.js';
import { FactorRegistry } from './FactorRegistry.js';
import { FactorCombiner, NORMALIZATION_METHOD, COMBINATION_METHOD } from './FactorCombiner.js';
import { FACTOR_DIRECTION } from './BaseFactor.js';

// 导入所有预定义因子
import {
  MomentumFactor,
  Momentum1D,
  Momentum7D,
  Momentum30D,
  RiskAdjustedMomentum7D,
  createMomentumFactor,
} from './factors/MomentumFactor.js';

import {
  VolatilityFactor,
  BollingerWidth20,
  ATRRatio,
  KeltnerSqueeze,
  VolatilityPercentile,
  createVolatilityFactor,
} from './factors/VolatilityFactor.js';

import {
  MoneyFlowFactor,
  MFI14,
  OBVSlope20,
  CMF20,
  createMoneyFlowFactor,
} from './factors/MoneyFlowFactor.js';

import {
  TurnoverFactor,
  VolumeMAR20,
  RelativeVolume,
  AbnormalVolume,
  createTurnoverFactor,
} from './factors/TurnoverFactor.js';

import {
  FundingRateFactor,
  FundingRatePercentile,
  FundingRateExtreme,
  createFundingRateFactor,
} from './factors/FundingRateFactor.js';

import {
  LargeOrderFactor,
  LargeOrderVolumeRatio,
  LargeOrderImbalance,
  WhaleActivity,
  createLargeOrderFactor,
} from './factors/LargeOrderFactor.js';

/**
 * 仓位类型
 * Position Types
 */
export const POSITION_TYPE = {
  LONG_ONLY: 'long_only',           // 只做多
  SHORT_ONLY: 'short_only',         // 只做空
  LONG_SHORT: 'long_short',         // 多空对冲
  MARKET_NEUTRAL: 'market_neutral', // 市场中性
};

/**
 * 权重分配方法
 * Weight Allocation Methods
 */
export const WEIGHT_METHOD = {
  EQUAL: 'equal',                     // 等权重
  SCORE_WEIGHTED: 'score_weighted',   // 按得分加权
  VOLATILITY_PARITY: 'vol_parity',    // 波动率平价
  RISK_PARITY: 'risk_parity',         // 风险平价
};

/**
 * 因子投资策略类
 * Factor Investing Strategy Class
 */
export class FactorInvestingStrategy extends BaseStrategy {
  /**
   * @param {Object} params - 策略参数
   * @param {string[]} params.symbols - 交易对列表
   * @param {Object} params.factorConfig - 因子配置
   * @param {number} params.topN - 做多数量
   * @param {number} params.bottomN - 做空数量
   * @param {string} params.positionType - 仓位类型
   * @param {string} params.weightMethod - 权重分配方法
   * @param {number} params.rebalancePeriod - 再平衡周期 (毫秒)
   */
  constructor(params = {}) {
    super({
      name: params.name || 'FactorInvestingStrategy',
      ...params,
    });

    // 资产池 / Asset pool
    this.symbols = params.symbols || [];

    // 因子配置 / Factor configuration
    this.factorConfig = params.factorConfig || this._getDefaultFactorConfig();

    // 选股参数 / Stock selection parameters
    this.topN = params.topN || 5;
    this.bottomN = params.bottomN || 5;
    this.positionType = params.positionType || POSITION_TYPE.LONG_ONLY;
    this.weightMethod = params.weightMethod || WEIGHT_METHOD.EQUAL;

    // 再平衡配置 / Rebalance configuration
    this.rebalancePeriod = params.rebalancePeriod || 24 * 60 * 60 * 1000; // 默认每天
    this.lastRebalanceTime = 0;
    this.minRebalanceChange = params.minRebalanceChange || 0.1; // 10% 变化才再平衡

    // 仓位限制 / Position limits
    this.maxPositionPerAsset = params.maxPositionPerAsset || 0.2; // 单资产最大 20%
    this.maxTotalPosition = params.maxTotalPosition || 1.0; // 总仓位最大 100%

    // 因子系统组件 / Factor system components
    this.registry = new FactorRegistry();
    this.combiner = null;

    // 数据缓存 / Data cache
    this.assetData = new Map(); // symbol -> { candles, fundingRates, trades }
    this.currentScores = null;
    this.currentRankings = null;
    this.currentPositions = new Map(); // symbol -> { side, weight, score }

    // 统计信息 / Statistics
    this.stats = {
      totalRebalances: 0,
      lastFactorValues: null,
      lastSelections: null,
    };
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    // 初始化因子 / Initialize factors
    this._initializeFactors();

    // 初始化组合器 / Initialize combiner
    this._initializeCombiner();

    this.log('因子投资策略初始化完成');
    this.log(`资产池: ${this.symbols.length} 个资产`);
    this.log(`注册因子: ${this.registry.getNames().length} 个`);
    this.log(`仓位类型: ${this.positionType}`);
    this.log(`Top N: ${this.topN}, Bottom N: ${this.bottomN}`);
  }

  /**
   * K线更新处理
   */
  async onTick(candle, history) {
    const symbol = candle.symbol;

    // 更新资产数据 / Update asset data
    this._updateAssetData(symbol, candle, history);

    // 检查是否需要再平衡 / Check if rebalance needed
    const now = Date.now();
    if (now - this.lastRebalanceTime >= this.rebalancePeriod) {
      await this._rebalance();
      this.lastRebalanceTime = now;
    }
  }

  /**
   * 资金费率更新
   */
  async onFundingRate(data) {
    const symbol = data.symbol;
    if (!this.assetData.has(symbol)) {
      this.assetData.set(symbol, { candles: [], fundingRates: [], trades: [] });
    }

    const assetInfo = this.assetData.get(symbol);
    assetInfo.fundingRates.push({
      rate: data.rate,
      timestamp: data.timestamp || Date.now(),
    });

    // 保留最近 200 条 / Keep last 200
    if (assetInfo.fundingRates.length > 200) {
      assetInfo.fundingRates.shift();
    }
  }

  /**
   * 执行再平衡
   * @private
   */
  async _rebalance() {
    this.log('开始因子计算和再平衡...');

    try {
      // 1. 计算所有因子值 / Calculate all factor values
      const factorValues = await this._calculateAllFactors();

      // 2. 计算综合得分 / Calculate composite scores
      const scores = this.combiner.calculateScores(factorValues, this.symbols);
      this.currentScores = scores;

      // 3. 生成排名和选股 / Generate rankings and selection
      const selections = this._selectAssets(scores);
      this.currentRankings = selections.rankings;
      this.stats.lastSelections = selections;

      // 4. 计算目标权重 / Calculate target weights
      const targetWeights = this._calculateTargetWeights(selections);

      // 5. 执行再平衡交易 / Execute rebalance trades
      await this._executeRebalance(targetWeights);

      this.stats.totalRebalances++;
      this.stats.lastFactorValues = factorValues;

      this.log(`再平衡完成: Long ${selections.long.length}, Short ${selections.short.length}`);

      // 发出事件 / Emit event
      this.emit('rebalanced', {
        scores,
        selections,
        targetWeights,
        timestamp: Date.now(),
      });

    } catch (error) {
      this.log(`再平衡失败: ${error.message}`, 'error');
      this.onError(error);
    }
  }

  /**
   * 计算所有因子值
   * @private
   */
  async _calculateAllFactors() {
    // 准备数据映射 / Prepare data map
    const dataMap = {};
    for (const symbol of this.symbols) {
      const assetInfo = this.assetData.get(symbol);
      if (assetInfo && assetInfo.candles.length > 0) {
        dataMap[symbol] = {
          candles: assetInfo.candles,
          fundingRates: assetInfo.fundingRates || [],
          trades: assetInfo.trades || [],
        };
      }
    }

    // 批量计算因子 / Batch calculate factors
    const factorNames = this.registry.getNames();
    const factorValues = await this.registry.calculateBatch(factorNames, dataMap);

    return factorValues;
  }

  /**
   * 选择资产 (Top N / Bottom N)
   * @private
   */
  _selectAssets(scores) {
    const rankings = this.combiner.generateRankings(scores, 'descending');

    let longAssets = [];
    let shortAssets = [];

    switch (this.positionType) {
      case POSITION_TYPE.LONG_ONLY:
        longAssets = rankings.slice(0, this.topN);
        break;

      case POSITION_TYPE.SHORT_ONLY:
        shortAssets = rankings.slice(-this.bottomN).reverse();
        break;

      case POSITION_TYPE.LONG_SHORT:
      case POSITION_TYPE.MARKET_NEUTRAL:
        longAssets = rankings.slice(0, this.topN);
        shortAssets = rankings.slice(-this.bottomN).reverse();
        break;
    }

    return {
      long: longAssets,
      short: shortAssets,
      rankings,
    };
  }

  /**
   * 计算目标权重
   * @private
   */
  _calculateTargetWeights(selections) {
    const { long: longAssets, short: shortAssets } = selections;
    const weights = new Map();

    // 计算多头权重 / Calculate long weights
    const longWeights = this._allocateWeights(longAssets);
    for (const [symbol, weight] of longWeights) {
      weights.set(symbol, { side: 'long', weight });
    }

    // 计算空头权重 / Calculate short weights
    const shortWeights = this._allocateWeights(shortAssets);
    for (const [symbol, weight] of shortWeights) {
      weights.set(symbol, { side: 'short', weight });
    }

    // 市场中性调整 / Market neutral adjustment
    if (this.positionType === POSITION_TYPE.MARKET_NEUTRAL) {
      const totalLong = Array.from(longWeights.values()).reduce((a, b) => a + b, 0);
      const totalShort = Array.from(shortWeights.values()).reduce((a, b) => a + b, 0);

      if (totalLong > 0 && totalShort > 0) {
        const ratio = totalShort / totalLong;
        for (const [symbol, info] of weights) {
          if (info.side === 'long') {
            info.weight *= ratio;
          }
        }
      }
    }

    return weights;
  }

  /**
   * 分配权重
   * @private
   */
  _allocateWeights(assets) {
    const n = assets.length;
    if (n === 0) return new Map();

    const weights = new Map();

    switch (this.weightMethod) {
      case WEIGHT_METHOD.EQUAL:
        // 等权重 / Equal weight
        const equalWeight = Math.min(1 / n, this.maxPositionPerAsset);
        assets.forEach(a => weights.set(a.symbol, equalWeight));
        break;

      case WEIGHT_METHOD.SCORE_WEIGHTED:
        // 按得分加权 / Score weighted
        const totalScore = assets.reduce((sum, a) => sum + Math.max(a.score, 0), 0);
        if (totalScore > 0) {
          assets.forEach(a => {
            const w = Math.min(Math.max(a.score, 0) / totalScore, this.maxPositionPerAsset);
            weights.set(a.symbol, w);
          });
        } else {
          // 退化为等权重 / Fallback to equal weight
          const ew = Math.min(1 / n, this.maxPositionPerAsset);
          assets.forEach(a => weights.set(a.symbol, ew));
        }
        break;

      default:
        const defaultWeight = Math.min(1 / n, this.maxPositionPerAsset);
        assets.forEach(a => weights.set(a.symbol, defaultWeight));
    }

    // 归一化确保总权重不超过限制 / Normalize to ensure total weight within limit
    const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    const maxAllowed = this.maxTotalPosition / 2; // 多空各占一半

    if (totalWeight > maxAllowed) {
      const scale = maxAllowed / totalWeight;
      for (const [symbol, weight] of weights) {
        weights.set(symbol, weight * scale);
      }
    }

    return weights;
  }

  /**
   * 执行再平衡交易
   * @private
   */
  async _executeRebalance(targetWeights) {
    // 获取当前持仓 / Get current positions
    const currentPositions = new Map();
    for (const symbol of this.symbols) {
      const position = this.getPosition(symbol);
      if (position && position.amount !== 0) {
        currentPositions.set(symbol, position);
      }
    }

    // 计算需要调整的仓位 / Calculate position adjustments
    const adjustments = [];

    // 需要减仓或平仓的 / Positions to reduce or close
    for (const [symbol, position] of currentPositions) {
      const target = targetWeights.get(symbol);

      if (!target) {
        // 平仓 / Close position
        adjustments.push({ symbol, action: 'close', current: position });
      } else if (target.side !== (position.amount > 0 ? 'long' : 'short')) {
        // 方向改变，先平仓 / Direction changed, close first
        adjustments.push({ symbol, action: 'close', current: position });
        adjustments.push({ symbol, action: 'open', target });
      } else {
        // 调整仓位大小 / Adjust position size
        adjustments.push({ symbol, action: 'adjust', current: position, target });
      }
    }

    // 需要新开仓的 / New positions to open
    for (const [symbol, target] of targetWeights) {
      if (!currentPositions.has(symbol)) {
        adjustments.push({ symbol, action: 'open', target });
      }
    }

    // 执行调整 / Execute adjustments
    for (const adj of adjustments) {
      await this._executeAdjustment(adj);
    }

    // 更新当前仓位记录 / Update current positions record
    this.currentPositions = targetWeights;
  }

  /**
   * 执行单个仓位调整
   * @private
   */
  async _executeAdjustment(adjustment) {
    const { symbol, action, target } = adjustment;

    try {
      switch (action) {
        case 'close':
          this.closePosition(symbol);
          this.log(`平仓: ${symbol}`);
          break;

        case 'open':
          if (target.side === 'long') {
            this.buyPercent(symbol, target.weight * 100);
            this.log(`开多: ${symbol} (${(target.weight * 100).toFixed(1)}%)`);
          } else {
            // 做空逻辑 (需要交易所支持) / Short logic (requires exchange support)
            this.log(`开空: ${symbol} (${(target.weight * 100).toFixed(1)}%)`);
          }
          break;

        case 'adjust':
          // 简化处理: 先平仓再开仓 / Simplified: close then open
          this.closePosition(symbol);
          if (target.side === 'long') {
            this.buyPercent(symbol, target.weight * 100);
          }
          this.log(`调整: ${symbol} → ${(target.weight * 100).toFixed(1)}%`);
          break;
      }
    } catch (error) {
      this.log(`仓位调整失败 ${symbol}: ${error.message}`, 'error');
    }
  }

  /**
   * 更新资产数据
   * @private
   */
  _updateAssetData(symbol, candle, history) {
    if (!this.assetData.has(symbol)) {
      this.assetData.set(symbol, { candles: [], fundingRates: [], trades: [] });
    }

    const assetInfo = this.assetData.get(symbol);

    // 使用历史数据或当前K线 / Use history or current candle
    if (history && history.length > 0) {
      assetInfo.candles = [...history];
    } else {
      assetInfo.candles.push(candle);
      if (assetInfo.candles.length > 200) {
        assetInfo.candles.shift();
      }
    }
  }

  /**
   * 初始化因子
   * @private
   */
  _initializeFactors() {
    const config = this.factorConfig;

    // 注册动量因子 / Register momentum factors
    if (config.momentum?.enabled !== false) {
      const momWeights = config.momentum?.weights || {};
      this.registry.register(Momentum1D);
      this.registry.register(Momentum7D);
      this.registry.register(Momentum30D);

      if (config.momentum?.riskAdjusted) {
        this.registry.register(RiskAdjustedMomentum7D);
      }
    }

    // 注册波动率因子 / Register volatility factors
    if (config.volatility?.enabled !== false) {
      this.registry.register(BollingerWidth20);
      this.registry.register(ATRRatio);

      if (config.volatility?.squeeze) {
        this.registry.register(KeltnerSqueeze);
      }
    }

    // 注册资金流向因子 / Register money flow factors
    if (config.moneyFlow?.enabled !== false) {
      this.registry.register(MFI14);
      this.registry.register(CMF20);

      if (config.moneyFlow?.obv) {
        this.registry.register(OBVSlope20);
      }
    }

    // 注册换手率因子 / Register turnover factors
    if (config.turnover?.enabled !== false) {
      this.registry.register(VolumeMAR20);
      this.registry.register(RelativeVolume);

      if (config.turnover?.abnormal) {
        this.registry.register(AbnormalVolume);
      }
    }

    // 注册资金费率因子 / Register funding rate factors
    if (config.fundingRate?.enabled) {
      this.registry.register(FundingRatePercentile);
      this.registry.register(FundingRateExtreme);
    }

    // 注册大单因子 / Register large order factors
    if (config.largeOrder?.enabled) {
      this.registry.register(LargeOrderVolumeRatio);
      this.registry.register(LargeOrderImbalance);

      if (config.largeOrder?.whale) {
        this.registry.register(WhaleActivity);
      }
    }
  }

  /**
   * 初始化组合器
   * @private
   */
  _initializeCombiner() {
    // 获取因子权重 / Get factor weights
    const factorWeights = this._buildFactorWeights();

    // 获取因子方向 / Get factor directions
    const factorDirections = this._buildFactorDirections();

    this.combiner = new FactorCombiner({
      factorWeights,
      factorDirections,
      normalizationMethod: this.factorConfig.normalization || NORMALIZATION_METHOD.ZSCORE,
      combinationMethod: this.factorConfig.combination || COMBINATION_METHOD.WEIGHTED_AVERAGE,
      adjustForDirection: true,
    });
  }

  /**
   * 构建因子权重
   * @private
   */
  _buildFactorWeights() {
    const config = this.factorConfig;
    const weights = {};

    // 动量因子权重 / Momentum weights
    if (config.momentum?.enabled !== false) {
      const momWeight = config.momentum?.totalWeight || 0.3;
      weights['Momentum_1d'] = momWeight * 0.2;
      weights['Momentum_7d'] = momWeight * 0.4;
      weights['Momentum_30d'] = momWeight * 0.4;

      if (config.momentum?.riskAdjusted) {
        weights['RiskAdj_Momentum_7d'] = momWeight * 0.3;
        weights['Momentum_7d'] = momWeight * 0.2;
      }
    }

    // 波动率因子权重 / Volatility weights
    if (config.volatility?.enabled !== false) {
      const volWeight = config.volatility?.totalWeight || 0.15;
      weights['BB_Width_20'] = volWeight * 0.5;
      weights['ATR_Ratio'] = volWeight * 0.5;
    }

    // 资金流向因子权重 / Money flow weights
    if (config.moneyFlow?.enabled !== false) {
      const mfWeight = config.moneyFlow?.totalWeight || 0.2;
      weights['MFI_14'] = mfWeight * 0.5;
      weights['CMF_20'] = mfWeight * 0.5;
    }

    // 换手率因子权重 / Turnover weights
    if (config.turnover?.enabled !== false) {
      const turnWeight = config.turnover?.totalWeight || 0.15;
      weights['Vol_MA_Ratio_20'] = turnWeight * 0.5;
      weights['Relative_Volume'] = turnWeight * 0.5;
    }

    // 资金费率因子权重 / Funding rate weights
    if (config.fundingRate?.enabled) {
      const frWeight = config.fundingRate?.totalWeight || 0.1;
      weights['Funding_Percentile'] = frWeight * 0.5;
      weights['Funding_Extreme_Signal'] = frWeight * 0.5;
    }

    // 大单因子权重 / Large order weights
    if (config.largeOrder?.enabled) {
      const loWeight = config.largeOrder?.totalWeight || 0.1;
      weights['LargeOrder_Vol_Ratio'] = loWeight * 0.5;
      weights['LargeOrder_Imbalance'] = loWeight * 0.5;
    }

    return weights;
  }

  /**
   * 构建因子方向
   * @private
   */
  _buildFactorDirections() {
    return {
      // 动量因子 - 正向
      'Momentum_1d': FACTOR_DIRECTION.POSITIVE,
      'Momentum_7d': FACTOR_DIRECTION.POSITIVE,
      'Momentum_30d': FACTOR_DIRECTION.POSITIVE,
      'RiskAdj_Momentum_7d': FACTOR_DIRECTION.POSITIVE,

      // 波动率因子 - 负向 (低波动率 = 好)
      'BB_Width_20': FACTOR_DIRECTION.NEGATIVE,
      'ATR_Ratio': FACTOR_DIRECTION.NEGATIVE,
      'Keltner_Squeeze': FACTOR_DIRECTION.NEGATIVE,

      // 资金流向因子 - 正向
      'MFI_14': FACTOR_DIRECTION.POSITIVE,
      'CMF_20': FACTOR_DIRECTION.POSITIVE,
      'OBV_Slope_20': FACTOR_DIRECTION.POSITIVE,

      // 换手率因子 - 正向
      'Vol_MA_Ratio_20': FACTOR_DIRECTION.POSITIVE,
      'Relative_Volume': FACTOR_DIRECTION.POSITIVE,

      // 资金费率因子 - 负向 (负费率 = 做多机会)
      'Funding_Percentile': FACTOR_DIRECTION.NEGATIVE,
      'Funding_Extreme_Signal': FACTOR_DIRECTION.NEGATIVE,

      // 大单因子 - 正向
      'LargeOrder_Vol_Ratio': FACTOR_DIRECTION.POSITIVE,
      'LargeOrder_Imbalance': FACTOR_DIRECTION.POSITIVE,
      'Whale_Activity': FACTOR_DIRECTION.POSITIVE,
    };
  }

  /**
   * 获取默认因子配置
   * @private
   */
  _getDefaultFactorConfig() {
    return {
      // 动量因子
      momentum: {
        enabled: true,
        totalWeight: 0.35,
        riskAdjusted: true,
      },

      // 波动率因子
      volatility: {
        enabled: true,
        totalWeight: 0.15,
        squeeze: false,
      },

      // 资金流向因子
      moneyFlow: {
        enabled: true,
        totalWeight: 0.2,
        obv: true,
      },

      // 换手率因子
      turnover: {
        enabled: true,
        totalWeight: 0.15,
        abnormal: false,
      },

      // 资金费率因子
      fundingRate: {
        enabled: false,
        totalWeight: 0.1,
      },

      // 大单因子
      largeOrder: {
        enabled: false,
        totalWeight: 0.05,
        whale: false,
      },

      // 标准化和组合方法
      normalization: NORMALIZATION_METHOD.ZSCORE,
      combination: COMBINATION_METHOD.WEIGHTED_AVERAGE,
    };
  }

  /**
   * 获取当前状态
   */
  getState(key, defaultValue = null) {
    if (key === 'scores') return this.currentScores;
    if (key === 'rankings') return this.currentRankings;
    if (key === 'positions') return this.currentPositions;
    if (key === 'stats') return this.stats;

    return super.getState(key, defaultValue);
  }

  /**
   * 获取策略信息
   */
  getInfo() {
    return {
      name: this.name,
      symbols: this.symbols.length,
      positionType: this.positionType,
      topN: this.topN,
      bottomN: this.bottomN,
      weightMethod: this.weightMethod,
      registeredFactors: this.registry.getNames(),
      lastRebalance: this.lastRebalanceTime,
      totalRebalances: this.stats.totalRebalances,
    };
  }
}

// 导出
export default FactorInvestingStrategy;
