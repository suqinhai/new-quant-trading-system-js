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

import { BaseStrategy } from '../strategies/BaseStrategy.js'; // 导入模块 ../strategies/BaseStrategy.js
import { FactorRegistry } from './FactorRegistry.js'; // 导入模块 ./FactorRegistry.js
import { FactorCombiner, NORMALIZATION_METHOD, COMBINATION_METHOD } from './FactorCombiner.js'; // 导入模块 ./FactorCombiner.js
import { FACTOR_DIRECTION } from './BaseFactor.js'; // 导入模块 ./BaseFactor.js

// 导入所有预定义因子
import { // 导入依赖
  MomentumFactor, // 执行语句
  Momentum1D, // 执行语句
  Momentum7D, // 执行语句
  Momentum30D, // 执行语句
  RiskAdjustedMomentum7D, // 执行语句
  createMomentumFactor, // 执行语句
} from './factors/MomentumFactor.js'; // 执行语句

import { // 导入依赖
  VolatilityFactor, // 执行语句
  BollingerWidth20, // 执行语句
  ATRRatio, // 执行语句
  KeltnerSqueeze, // 执行语句
  VolatilityPercentile, // 执行语句
  createVolatilityFactor, // 执行语句
} from './factors/VolatilityFactor.js'; // 执行语句

import { // 导入依赖
  MoneyFlowFactor, // 执行语句
  MFI14, // 执行语句
  OBVSlope20, // 执行语句
  CMF20, // 执行语句
  createMoneyFlowFactor, // 执行语句
} from './factors/MoneyFlowFactor.js'; // 执行语句

import { // 导入依赖
  TurnoverFactor, // 执行语句
  VolumeMAR20, // 执行语句
  RelativeVolume, // 执行语句
  AbnormalVolume, // 执行语句
  createTurnoverFactor, // 执行语句
} from './factors/TurnoverFactor.js'; // 执行语句

import { // 导入依赖
  FundingRateFactor, // 执行语句
  FundingRatePercentile, // 执行语句
  FundingRateExtreme, // 执行语句
  createFundingRateFactor, // 执行语句
} from './factors/FundingRateFactor.js'; // 执行语句

import { // 导入依赖
  LargeOrderFactor, // 执行语句
  LargeOrderVolumeRatio, // 执行语句
  LargeOrderImbalance, // 执行语句
  WhaleActivity, // 执行语句
  createLargeOrderFactor, // 执行语句
} from './factors/LargeOrderFactor.js'; // 执行语句

/**
 * 仓位类型
 * Position Types
 */
export const POSITION_TYPE = { // 导出常量 POSITION_TYPE
  LONG_ONLY: 'long_only',           // LONG仅
  SHORT_ONLY: 'short_only',         // SHORT仅
  LONG_SHORT: 'long_short',         // LONGSHORT
  MARKET_NEUTRAL: 'market_neutral', // 市场NEUTRAL
}; // 结束代码块

/**
 * 权重分配方法
 * Weight Allocation Methods
 */
export const WEIGHT_METHOD = { // 导出常量 WEIGHT_METHOD
  EQUAL: 'equal',                     // EQUAL
  SCORE_WEIGHTED: 'score_weighted',   // 分数WEIGHTED
  VOLATILITY_PARITY: 'vol_parity',    // 波动率PARITY
  RISK_PARITY: 'risk_parity',         // 风险PARITY
}; // 结束代码块

/**
 * 因子投资策略类
 * Factor Investing Strategy Class
 */
export class FactorInvestingStrategy extends BaseStrategy { // 导出类 FactorInvestingStrategy
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
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: params.name || 'FactorInvestingStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // 资产池 / Asset pool
    this.symbols = params.symbols || []; // 设置 symbols

    // 因子配置 / Factor configuration
    this.factorConfig = params.factorConfig || this._getDefaultFactorConfig(); // 设置 factorConfig

    // 选股参数 / Stock selection parameters
    this.topN = params.topN || 5; // 设置 topN
    this.bottomN = params.bottomN || 5; // 设置 bottomN
    this.positionType = params.positionType || POSITION_TYPE.LONG_ONLY; // 设置 positionType
    this.weightMethod = params.weightMethod || WEIGHT_METHOD.EQUAL; // 设置 weightMethod

    // 再平衡配置 / Rebalance configuration
    this.rebalancePeriod = params.rebalancePeriod || 1 * 60 * 60 * 1000; // 默认每小时 / Default every hour
    this.lastRebalanceTime = 0; // 设置 lastRebalanceTime
    this.minRebalanceChange = params.minRebalanceChange || 0.1; // 10% 变化才再平衡

    // 仓位限制 / Position limits
    this.maxPositionPerAsset = params.maxPositionPerAsset || 0.2; // 单资产最大 20%
    this.maxTotalPosition = params.maxTotalPosition || 1.0; // 总仓位最大 100%

    // 因子系统组件 / Factor system components
    this.registry = new FactorRegistry(); // 设置 registry
    this.combiner = null; // 设置 combiner

    // 数据缓存 / Data cache
    this.assetData = new Map(); // symbol -> { candles, fundingRates, trades }
    this.currentScores = null; // 设置 currentScores
    this.currentRankings = null; // 设置 currentRankings
    this.currentPositions = new Map(); // symbol -> { side, weight, score }

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalRebalances: 0, // 总Rebalances
      lastFactorValues: null, // lastFactorValues
      lastSelections: null, // lastSelections
    }; // 结束代码块
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    // 初始化因子 / Initialize factors
    this._initializeFactors(); // 调用 _initializeFactors

    // 初始化组合器 / Initialize combiner
    this._initializeCombiner(); // 调用 _initializeCombiner

    this.log('因子投资策略初始化完成'); // 调用 log
    this.log(`资产池: ${this.symbols.length} 个资产`); // 调用 log
    this.log(`注册因子: ${this.registry.getNames().length} 个`); // 调用 log
    this.log(`仓位类型: ${this.positionType}`); // 调用 log
    this.log(`Top N: ${this.topN}, Bottom N: ${this.bottomN}`); // 调用 log
  } // 结束代码块

  /**
   * K线更新处理
   */
  async onTick(candle, history) { // 执行语句
    const symbol = candle.symbol; // 定义常量 symbol

    // 调试日志: 确认 onTick 被调用 / Debug log: confirm onTick is called
    this.log(`[DEBUG] onTick 收到 K 线: ${symbol}, close=${candle.close}, history=${history?.length || 0}根`); // 调用 log

    // 更新资产数据 / Update asset data
    this._updateAssetData(symbol, candle, history); // 调用 _updateAssetData

    // 检查是否需要再平衡 / Check if rebalance needed
    const now = Date.now(); // 定义常量 now
    const timeSinceLastRebalance = now - this.lastRebalanceTime; // 定义常量 timeSinceLastRebalance
    if (timeSinceLastRebalance >= this.rebalancePeriod) { // 条件判断 timeSinceLastRebalance >= this.rebalancePeriod
      this.log(`[DEBUG] 触发再平衡: 距上次 ${Math.round(timeSinceLastRebalance / 1000 / 60)} 分钟`); // 调用 log
      await this._rebalance(); // 等待异步结果
      this.lastRebalanceTime = now; // 设置 lastRebalanceTime
    } // 结束代码块
  } // 结束代码块

  /**
   * 资金费率更新
   */
  async onFundingRate(data) { // 执行语句
    const symbol = data.symbol; // 定义常量 symbol
    if (!this.assetData.has(symbol)) { // 条件判断 !this.assetData.has(symbol)
      this.assetData.set(symbol, { candles: [], fundingRates: [], trades: [] }); // 访问 assetData
    } // 结束代码块

    const assetInfo = this.assetData.get(symbol); // 定义常量 assetInfo
    assetInfo.fundingRates.push({ // 调用 assetInfo.fundingRates.push
      rate: data.rate, // 频率
      timestamp: data.timestamp || Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近 200 条 / Keep last 200
    if (assetInfo.fundingRates.length > 200) { // 条件判断 assetInfo.fundingRates.length > 200
      assetInfo.fundingRates.shift(); // 调用 assetInfo.fundingRates.shift
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行再平衡
   * @private
   */
  async _rebalance() { // 执行语句
    this.log('开始因子计算和再平衡...'); // 调用 log

    try { // 尝试执行
      // 1. 计算所有因子值 / Calculate all factor values
      const factorValues = await this._calculateAllFactors(); // 定义常量 factorValues

      // 2. 计算综合得分 / Calculate composite scores
      const scores = this.combiner.calculateScores(factorValues, this.symbols); // 定义常量 scores
      this.currentScores = scores; // 设置 currentScores

      // 3. 生成排名和选股 / Generate rankings and selection
      const selections = this._selectAssets(scores); // 定义常量 selections
      this.currentRankings = selections.rankings; // 设置 currentRankings
      this.stats.lastSelections = selections; // 访问 stats

      // 4. 计算目标权重 / Calculate target weights
      const targetWeights = this._calculateTargetWeights(selections); // 定义常量 targetWeights

      // 5. 执行再平衡交易 / Execute rebalance trades
      await this._executeRebalance(targetWeights); // 等待异步结果

      this.stats.totalRebalances++; // 访问 stats
      this.stats.lastFactorValues = factorValues; // 访问 stats

      this.log(`再平衡完成: Long ${selections.long.length}, Short ${selections.short.length}`); // 调用 log

      // 发出事件 / Emit event
      this.emit('rebalanced', { // 调用 emit
        scores, // 执行语句
        selections, // 执行语句
        targetWeights, // 执行语句
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块

    } catch (error) { // 执行语句
      this.log(`再平衡失败: ${error.message}`, 'error'); // 调用 log
      this.onError(error); // 调用 onError
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算所有因子值
   * @private
   */
  async _calculateAllFactors() { // 执行语句
    // 准备数据映射 / Prepare data map
    const dataMap = {}; // 定义常量 dataMap
    for (const symbol of this.symbols) { // 循环 const symbol of this.symbols
      const assetInfo = this.assetData.get(symbol); // 定义常量 assetInfo
      if (assetInfo && assetInfo.candles.length > 0) { // 条件判断 assetInfo && assetInfo.candles.length > 0
        dataMap[symbol] = { // 执行语句
          candles: assetInfo.candles, // candles
          fundingRates: assetInfo.fundingRates || [], // 资金费率Rates
          trades: assetInfo.trades || [], // 成交
        }; // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 批量计算因子 / Batch calculate factors
    const factorNames = this.registry.getNames(); // 定义常量 factorNames
    const factorValues = await this.registry.calculateBatch(factorNames, dataMap); // 定义常量 factorValues

    return factorValues; // 返回结果
  } // 结束代码块

  /**
   * 选择资产 (Top N / Bottom N)
   * @private
   */
  _selectAssets(scores) { // 调用 _selectAssets
    const rankings = this.combiner.generateRankings(scores, 'descending'); // 定义常量 rankings

    let longAssets = []; // 定义变量 longAssets
    let shortAssets = []; // 定义变量 shortAssets

    switch (this.positionType) { // 分支选择 this.positionType
      case POSITION_TYPE.LONG_ONLY: // 分支 POSITION_TYPE.LONG_ONLY
        longAssets = rankings.slice(0, this.topN); // 赋值 longAssets
        break; // 跳出循环或分支

      case POSITION_TYPE.SHORT_ONLY: // 分支 POSITION_TYPE.SHORT_ONLY
        shortAssets = rankings.slice(-this.bottomN).reverse(); // 赋值 shortAssets
        break; // 跳出循环或分支

      case POSITION_TYPE.LONG_SHORT: // 分支 POSITION_TYPE.LONG_SHORT
      case POSITION_TYPE.MARKET_NEUTRAL: // 分支 POSITION_TYPE.MARKET_NEUTRAL
        longAssets = rankings.slice(0, this.topN); // 赋值 longAssets
        shortAssets = rankings.slice(-this.bottomN).reverse(); // 赋值 shortAssets
        break; // 跳出循环或分支
    } // 结束代码块

    return { // 返回结果
      long: longAssets, // long
      short: shortAssets, // short
      rankings, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算目标权重
   * @private
   */
  _calculateTargetWeights(selections) { // 调用 _calculateTargetWeights
    const { long: longAssets, short: shortAssets } = selections; // 解构赋值
    const weights = new Map(); // 定义常量 weights

    // 计算多头权重 / Calculate long weights
    const longWeights = this._allocateWeights(longAssets); // 定义常量 longWeights
    for (const [symbol, weight] of longWeights) { // 循环 const [symbol, weight] of longWeights
      weights.set(symbol, { side: 'long', weight }); // 调用 weights.set
    } // 结束代码块

    // 计算空头权重 / Calculate short weights
    const shortWeights = this._allocateWeights(shortAssets); // 定义常量 shortWeights
    for (const [symbol, weight] of shortWeights) { // 循环 const [symbol, weight] of shortWeights
      weights.set(symbol, { side: 'short', weight }); // 调用 weights.set
    } // 结束代码块

    // 市场中性调整 / Market neutral adjustment
    if (this.positionType === POSITION_TYPE.MARKET_NEUTRAL) { // 条件判断 this.positionType === POSITION_TYPE.MARKET_NE...
      const totalLong = Array.from(longWeights.values()).reduce((a, b) => a + b, 0); // 定义函数 totalLong
      const totalShort = Array.from(shortWeights.values()).reduce((a, b) => a + b, 0); // 定义函数 totalShort

      if (totalLong > 0 && totalShort > 0) { // 条件判断 totalLong > 0 && totalShort > 0
        const ratio = totalShort / totalLong; // 定义常量 ratio
        for (const [symbol, info] of weights) { // 循环 const [symbol, info] of weights
          if (info.side === 'long') { // 条件判断 info.side === 'long'
            info.weight *= ratio; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 分配权重
   * @private
   */
  _allocateWeights(assets) { // 调用 _allocateWeights
    const n = assets.length; // 定义常量 n
    if (n === 0) return new Map(); // 条件判断 n === 0

    const weights = new Map(); // 定义常量 weights

    switch (this.weightMethod) { // 分支选择 this.weightMethod
      case WEIGHT_METHOD.EQUAL: // 分支 WEIGHT_METHOD.EQUAL
        // 等权重 / Equal weight
        const equalWeight = Math.min(1 / n, this.maxPositionPerAsset); // 定义常量 equalWeight
        assets.forEach(a => weights.set(a.symbol, equalWeight)); // 调用 assets.forEach
        break; // 跳出循环或分支

      case WEIGHT_METHOD.SCORE_WEIGHTED: // 分支 WEIGHT_METHOD.SCORE_WEIGHTED
        // 按得分加权 / Score weighted
        const totalScore = assets.reduce((sum, a) => sum + Math.max(a.score, 0), 0); // 定义函数 totalScore
        if (totalScore > 0) { // 条件判断 totalScore > 0
          assets.forEach(a => { // 调用 assets.forEach
            const w = Math.min(Math.max(a.score, 0) / totalScore, this.maxPositionPerAsset); // 定义常量 w
            weights.set(a.symbol, w); // 调用 weights.set
          }); // 结束代码块
        } else { // 执行语句
          // 退化为等权重 / Fallback to equal weight
          const ew = Math.min(1 / n, this.maxPositionPerAsset); // 定义常量 ew
          assets.forEach(a => weights.set(a.symbol, ew)); // 调用 assets.forEach
        } // 结束代码块
        break; // 跳出循环或分支

      default: // 默认
        const defaultWeight = Math.min(1 / n, this.maxPositionPerAsset); // 定义常量 defaultWeight
        assets.forEach(a => weights.set(a.symbol, defaultWeight)); // 调用 assets.forEach
    } // 结束代码块

    // 归一化确保总权重不超过限制 / Normalize to ensure total weight within limit
    const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0); // 定义函数 totalWeight
    const maxAllowed = this.maxTotalPosition / 2; // 多空各占一半

    if (totalWeight > maxAllowed) { // 条件判断 totalWeight > maxAllowed
      const scale = maxAllowed / totalWeight; // 定义常量 scale
      for (const [symbol, weight] of weights) { // 循环 const [symbol, weight] of weights
        weights.set(symbol, weight * scale); // 调用 weights.set
      } // 结束代码块
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 执行再平衡交易
   * @private
   */
  async _executeRebalance(targetWeights) { // 执行语句
    // 获取当前持仓 / Get current positions
    const currentPositions = new Map(); // 定义常量 currentPositions
    for (const symbol of this.symbols) { // 循环 const symbol of this.symbols
      const position = this.getPosition(symbol); // 定义常量 position
      if (position && position.amount !== 0) { // 条件判断 position && position.amount !== 0
        currentPositions.set(symbol, position); // 调用 currentPositions.set
      } // 结束代码块
    } // 结束代码块

    // 计算需要调整的仓位 / Calculate position adjustments
    const adjustments = []; // 定义常量 adjustments

    // 需要减仓或平仓的 / Positions to reduce or close
    for (const [symbol, position] of currentPositions) { // 循环 const [symbol, position] of currentPositions
      const target = targetWeights.get(symbol); // 定义常量 target

      if (!target) { // 条件判断 !target
        // 平仓 / Close position
        adjustments.push({ symbol, action: 'close', current: position }); // 调用 adjustments.push
      } else if (target.side !== (position.amount > 0 ? 'long' : 'short')) { // 执行语句
        // 方向改变，先平仓 / Direction changed, close first
        adjustments.push({ symbol, action: 'close', current: position }); // 调用 adjustments.push
        adjustments.push({ symbol, action: 'open', target }); // 调用 adjustments.push
      } else { // 执行语句
        // 调整仓位大小 / Adjust position size
        adjustments.push({ symbol, action: 'adjust', current: position, target }); // 调用 adjustments.push
      } // 结束代码块
    } // 结束代码块

    // 需要新开仓的 / New positions to open
    for (const [symbol, target] of targetWeights) { // 循环 const [symbol, target] of targetWeights
      if (!currentPositions.has(symbol)) { // 条件判断 !currentPositions.has(symbol)
        adjustments.push({ symbol, action: 'open', target }); // 调用 adjustments.push
      } // 结束代码块
    } // 结束代码块

    // 执行调整 / Execute adjustments
    for (const adj of adjustments) { // 循环 const adj of adjustments
      await this._executeAdjustment(adj); // 等待异步结果
    } // 结束代码块

    // 更新当前仓位记录 / Update current positions record
    this.currentPositions = targetWeights; // 设置 currentPositions
  } // 结束代码块

  /**
   * 执行单个仓位调整
   * @private
   */
  async _executeAdjustment(adjustment) { // 执行语句
    const { symbol, action, target } = adjustment; // 解构赋值

    try { // 尝试执行
      switch (action) { // 分支选择 action
        case 'close': // 分支 'close'
          this.closePosition(symbol); // 调用 closePosition
          this.log(`平仓: ${symbol}`); // 调用 log
          break; // 跳出循环或分支

        case 'open': // 分支 'open'
          if (target.side === 'long') { // 条件判断 target.side === 'long'
            this.buyPercent(symbol, target.weight * 100); // 调用 buyPercent
            this.log(`开多: ${symbol} (${(target.weight * 100).toFixed(1)}%)`); // 调用 log
          } else { // 执行语句
            // 做空逻辑 (需要交易所支持) / Short logic (requires exchange support)
            this.log(`开空: ${symbol} (${(target.weight * 100).toFixed(1)}%)`); // 调用 log
          } // 结束代码块
          break; // 跳出循环或分支

        case 'adjust': // 分支 'adjust'
          // 简化处理: 先平仓再开仓 / Simplified: close then open
          this.closePosition(symbol); // 调用 closePosition
          if (target.side === 'long') { // 条件判断 target.side === 'long'
            this.buyPercent(symbol, target.weight * 100); // 调用 buyPercent
          } // 结束代码块
          this.log(`调整: ${symbol} → ${(target.weight * 100).toFixed(1)}%`); // 调用 log
          break; // 跳出循环或分支
      } // 结束代码块
    } catch (error) { // 执行语句
      this.log(`仓位调整失败 ${symbol}: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新资产数据
   * @private
   */
  _updateAssetData(symbol, candle, history) { // 调用 _updateAssetData
    if (!this.assetData.has(symbol)) { // 条件判断 !this.assetData.has(symbol)
      this.assetData.set(symbol, { candles: [], fundingRates: [], trades: [] }); // 访问 assetData
    } // 结束代码块

    const assetInfo = this.assetData.get(symbol); // 定义常量 assetInfo

    // 使用历史数据或当前K线 / Use history or current candle
    if (history && history.length > 0) { // 条件判断 history && history.length > 0
      assetInfo.candles = [...history]; // 赋值 assetInfo.candles
    } else { // 执行语句
      assetInfo.candles.push(candle); // 调用 assetInfo.candles.push
      if (assetInfo.candles.length > 200) { // 条件判断 assetInfo.candles.length > 200
        assetInfo.candles.shift(); // 调用 assetInfo.candles.shift
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化因子
   * @private
   */
  _initializeFactors() { // 调用 _initializeFactors
    const config = this.factorConfig; // 定义常量 config

    // 注册动量因子 / Register momentum factors
    if (config.momentum?.enabled !== false) { // 条件判断 config.momentum?.enabled !== false
      const momWeights = config.momentum?.weights || {}; // 定义常量 momWeights
      this.registry.register(Momentum1D); // 访问 registry
      this.registry.register(Momentum7D); // 访问 registry
      this.registry.register(Momentum30D); // 访问 registry

      if (config.momentum?.riskAdjusted) { // 条件判断 config.momentum?.riskAdjusted
        this.registry.register(RiskAdjustedMomentum7D); // 访问 registry
      } // 结束代码块
    } // 结束代码块

    // 注册波动率因子 / Register volatility factors
    if (config.volatility?.enabled !== false) { // 条件判断 config.volatility?.enabled !== false
      this.registry.register(BollingerWidth20); // 访问 registry
      this.registry.register(ATRRatio); // 访问 registry

      if (config.volatility?.squeeze) { // 条件判断 config.volatility?.squeeze
        this.registry.register(KeltnerSqueeze); // 访问 registry
      } // 结束代码块
    } // 结束代码块

    // 注册资金流向因子 / Register money flow factors
    if (config.moneyFlow?.enabled !== false) { // 条件判断 config.moneyFlow?.enabled !== false
      this.registry.register(MFI14); // 访问 registry
      this.registry.register(CMF20); // 访问 registry

      if (config.moneyFlow?.obv) { // 条件判断 config.moneyFlow?.obv
        this.registry.register(OBVSlope20); // 访问 registry
      } // 结束代码块
    } // 结束代码块

    // 注册换手率因子 / Register turnover factors
    if (config.turnover?.enabled !== false) { // 条件判断 config.turnover?.enabled !== false
      this.registry.register(VolumeMAR20); // 访问 registry
      this.registry.register(RelativeVolume); // 访问 registry

      if (config.turnover?.abnormal) { // 条件判断 config.turnover?.abnormal
        this.registry.register(AbnormalVolume); // 访问 registry
      } // 结束代码块
    } // 结束代码块

    // 注册资金费率因子 / Register funding rate factors
    if (config.fundingRate?.enabled) { // 条件判断 config.fundingRate?.enabled
      this.registry.register(FundingRatePercentile); // 访问 registry
      this.registry.register(FundingRateExtreme); // 访问 registry
    } // 结束代码块

    // 注册大单因子 / Register large order factors
    if (config.largeOrder?.enabled) { // 条件判断 config.largeOrder?.enabled
      this.registry.register(LargeOrderVolumeRatio); // 访问 registry
      this.registry.register(LargeOrderImbalance); // 访问 registry

      if (config.largeOrder?.whale) { // 条件判断 config.largeOrder?.whale
        this.registry.register(WhaleActivity); // 访问 registry
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化组合器
   * @private
   */
  _initializeCombiner() { // 调用 _initializeCombiner
    // 获取因子权重 / Get factor weights
    const factorWeights = this._buildFactorWeights(); // 定义常量 factorWeights

    // 获取因子方向 / Get factor directions
    const factorDirections = this._buildFactorDirections(); // 定义常量 factorDirections

    this.combiner = new FactorCombiner({ // 设置 combiner
      factorWeights, // 执行语句
      factorDirections, // 执行语句
      normalizationMethod: this.factorConfig.normalization || NORMALIZATION_METHOD.ZSCORE, // normalizationMethod
      combinationMethod: this.factorConfig.combination || COMBINATION_METHOD.WEIGHTED_AVERAGE, // combinationMethod
      adjustForDirection: true, // adjust用于Direction
    }); // 结束代码块
  } // 结束代码块

  /**
   * 构建因子权重
   * @private
   */
  _buildFactorWeights() { // 调用 _buildFactorWeights
    const config = this.factorConfig; // 定义常量 config
    const weights = {}; // 定义常量 weights

    // 动量因子权重 / Momentum weights
    if (config.momentum?.enabled !== false) { // 条件判断 config.momentum?.enabled !== false
      const momWeight = config.momentum?.totalWeight || 0.3; // 定义常量 momWeight
      weights['Momentum_1d'] = momWeight * 0.2; // 执行语句
      weights['Momentum_7d'] = momWeight * 0.4; // 执行语句
      weights['Momentum_30d'] = momWeight * 0.4; // 执行语句

      if (config.momentum?.riskAdjusted) { // 条件判断 config.momentum?.riskAdjusted
        weights['RiskAdj_Momentum_7d'] = momWeight * 0.3; // 执行语句
        weights['Momentum_7d'] = momWeight * 0.2; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 波动率因子权重 / Volatility weights
    if (config.volatility?.enabled !== false) { // 条件判断 config.volatility?.enabled !== false
      const volWeight = config.volatility?.totalWeight || 0.15; // 定义常量 volWeight
      weights['BB_Width_20'] = volWeight * 0.5; // 执行语句
      weights['ATR_Ratio'] = volWeight * 0.5; // 执行语句
    } // 结束代码块

    // 资金流向因子权重 / Money flow weights
    if (config.moneyFlow?.enabled !== false) { // 条件判断 config.moneyFlow?.enabled !== false
      const mfWeight = config.moneyFlow?.totalWeight || 0.2; // 定义常量 mfWeight
      weights['MFI_14'] = mfWeight * 0.5; // 执行语句
      weights['CMF_20'] = mfWeight * 0.5; // 执行语句
    } // 结束代码块

    // 换手率因子权重 / Turnover weights
    if (config.turnover?.enabled !== false) { // 条件判断 config.turnover?.enabled !== false
      const turnWeight = config.turnover?.totalWeight || 0.15; // 定义常量 turnWeight
      weights['Vol_MA_Ratio_20'] = turnWeight * 0.5; // 执行语句
      weights['Relative_Volume'] = turnWeight * 0.5; // 执行语句
    } // 结束代码块

    // 资金费率因子权重 / Funding rate weights
    if (config.fundingRate?.enabled) { // 条件判断 config.fundingRate?.enabled
      const frWeight = config.fundingRate?.totalWeight || 0.1; // 定义常量 frWeight
      weights['Funding_Percentile'] = frWeight * 0.5; // 执行语句
      weights['Funding_Extreme_Signal'] = frWeight * 0.5; // 执行语句
    } // 结束代码块

    // 大单因子权重 / Large order weights
    if (config.largeOrder?.enabled) { // 条件判断 config.largeOrder?.enabled
      const loWeight = config.largeOrder?.totalWeight || 0.1; // 定义常量 loWeight
      weights['LargeOrder_Vol_Ratio'] = loWeight * 0.5; // 执行语句
      weights['LargeOrder_Imbalance'] = loWeight * 0.5; // 执行语句
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 构建因子方向
   * @private
   */
  _buildFactorDirections() { // 调用 _buildFactorDirections
    return { // 返回结果
      // 动量因子 - 正向
      'Momentum_1d': FACTOR_DIRECTION.POSITIVE, // 动量因子 - 正向
      'Momentum_7d': FACTOR_DIRECTION.POSITIVE, // 动量7d
      'Momentum_30d': FACTOR_DIRECTION.POSITIVE, // 动量30d
      'RiskAdj_Momentum_7d': FACTOR_DIRECTION.POSITIVE, // 风险Adj动量7d

      // 波动率因子 - 负向 (低波动率 = 好)
      'BB_Width_20': FACTOR_DIRECTION.NEGATIVE, // 波动率因子 - 负向 (低波动率 = 好)
      'ATR_Ratio': FACTOR_DIRECTION.NEGATIVE, // ATR比例
      'Keltner_Squeeze': FACTOR_DIRECTION.NEGATIVE, // Keltner挤压

      // 资金流向因子 - 正向
      'MFI_14': FACTOR_DIRECTION.POSITIVE, // 资金流向因子 - 正向
      'CMF_20': FACTOR_DIRECTION.POSITIVE, // CMF20
      'OBV_Slope_20': FACTOR_DIRECTION.POSITIVE, // OBVSlope20

      // 换手率因子 - 正向
      'Vol_MA_Ratio_20': FACTOR_DIRECTION.POSITIVE, // 换手率因子 - 正向
      'Relative_Volume': FACTOR_DIRECTION.POSITIVE, // Relative成交量

      // 资金费率因子 - 负向 (负费率 = 做多机会)
      'Funding_Percentile': FACTOR_DIRECTION.NEGATIVE, // 资金费率因子 - 负向 (负费率 = 做多机会)
      'Funding_Extreme_Signal': FACTOR_DIRECTION.NEGATIVE, // 资金费率极端信号

      // 大单因子 - 正向
      'LargeOrder_Vol_Ratio': FACTOR_DIRECTION.POSITIVE, // 大单因子 - 正向
      'LargeOrder_Imbalance': FACTOR_DIRECTION.POSITIVE, // 大额订单Imbalance
      'Whale_Activity': FACTOR_DIRECTION.POSITIVE, // WhaleActivity
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取默认因子配置
   * @private
   */
  _getDefaultFactorConfig() { // 调用 _getDefaultFactorConfig
    return { // 返回结果
      // 动量因子
      momentum: { // 动量
        enabled: true, // 启用
        totalWeight: 0.35, // 总Weight
        riskAdjusted: true, // 风险Adjusted
      }, // 结束代码块

      // 波动率因子
      volatility: { // 波动率
        enabled: true, // 启用
        totalWeight: 0.15, // 总Weight
        squeeze: false, // 挤压
      }, // 结束代码块

      // 资金流向因子
      moneyFlow: { // money流
        enabled: true, // 启用
        totalWeight: 0.2, // 总Weight
        obv: true, // obv
      }, // 结束代码块

      // 换手率因子
      turnover: { // turnover
        enabled: true, // 启用
        totalWeight: 0.15, // 总Weight
        abnormal: false, // abnormal
      }, // 结束代码块

      // 资金费率因子
      fundingRate: { // 资金费率频率
        enabled: false, // 启用
        totalWeight: 0.1, // 总Weight
      }, // 结束代码块

      // 大单因子
      largeOrder: { // 大额订单
        enabled: false, // 启用
        totalWeight: 0.05, // 总Weight
        whale: false, // whale
      }, // 结束代码块

      // 标准化和组合方法
      normalization: NORMALIZATION_METHOD.ZSCORE, // 标准化和组合方法
      combination: COMBINATION_METHOD.WEIGHTED_AVERAGE, // combination
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取当前状态
   */
  getState(key, defaultValue = null) { // 调用 getState
    if (key === 'scores') return this.currentScores; // 条件判断 key === 'scores'
    if (key === 'rankings') return this.currentRankings; // 条件判断 key === 'rankings'
    if (key === 'positions') return this.currentPositions; // 条件判断 key === 'positions'
    if (key === 'stats') return this.stats; // 条件判断 key === 'stats'

    return super.getState(key, defaultValue); // 返回结果
  } // 结束代码块

  /**
   * 获取策略信息
   */
  getInfo() { // 调用 getInfo
    return { // 返回结果
      name: this.name, // name
      symbols: this.symbols.length, // 交易对列表
      positionType: this.positionType, // 持仓类型
      topN: this.topN, // topN
      bottomN: this.bottomN, // bottomN
      weightMethod: this.weightMethod, // weightMethod
      registeredFactors: this.registry.getNames(), // registeredFactors
      lastRebalance: this.lastRebalanceTime, // lastRebalance
      totalRebalances: this.stats.totalRebalances, // 总Rebalances
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出
export default FactorInvestingStrategy; // 默认导出
