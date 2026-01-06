/**
 * Regime 切换元策略 (Regime Switching Meta Strategy)
 *
 * 根据市场状态自动切换策略组合：
 * - 趋势市 → SMA / MACD
 * - 震荡市 → 网格 / 布林带 / RSI
 * - 高波动 → ATR 突破
 * - 极端情况 → 风控模式 (停止开仓)
 *
 * 这是一个"元策略"，内部管理多个子策略实例
 */

import { BaseStrategy } from './BaseStrategy.js';
import { MarketRegimeDetector, MarketRegime, RegimeEvent } from '../utils/MarketRegimeDetector.js';

// 子策略导入
import { SMAStrategy } from './SMAStrategy.js';
import { MACDStrategy } from './MACDStrategy.js';
import { RSIStrategy } from './RSIStrategy.js';
import { BollingerBandsStrategy } from './BollingerBandsStrategy.js';
import { GridStrategy } from './GridStrategy.js';
import { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js';
import { WeightedComboStrategy } from './WeightedComboStrategy.js';

/**
 * 策略配置映射
 */
const REGIME_STRATEGY_MAP = {
  [MarketRegime.TRENDING_UP]: {
    strategies: ['SMA', 'MACD', 'WeightedCombo'],
    weights: { SMA: 0.35, MACD: 0.25, WeightedCombo: 0.4 },
    description: '上涨趋势策略组',
  },
  [MarketRegime.TRENDING_DOWN]: {
    strategies: ['SMA', 'MACD', 'WeightedCombo'],
    weights: { SMA: 0.35, MACD: 0.25, WeightedCombo: 0.4 },
    description: '下跌趋势策略组',
  },
  [MarketRegime.RANGING]: {
    strategies: ['RSI', 'BollingerBands', 'Grid', 'WeightedCombo'],
    weights: { RSI: 0.2, BollingerBands: 0.25, Grid: 0.2, WeightedCombo: 0.35 },
    description: '震荡策略组',
  },
  [MarketRegime.HIGH_VOLATILITY]: {
    strategies: ['ATRBreakout', 'WeightedCombo'],
    weights: { ATRBreakout: 0.5, WeightedCombo: 0.5 },
    description: '高波动策略组',
  },
  [MarketRegime.EXTREME]: {
    strategies: [],
    weights: {},
    description: '风控模式 - 停止交易',
  },
};

/**
 * 获取策略类映射
 * 使用函数形式延迟获取策略类，避免循环依赖问题
 */
function getStrategyClassMap() {
  return {
    SMA: SMAStrategy,
    MACD: MACDStrategy,
    RSI: RSIStrategy,
    BollingerBands: BollingerBandsStrategy,
    Grid: GridStrategy,
    ATRBreakout: ATRBreakoutStrategy,
    WeightedCombo: WeightedComboStrategy,
  };
}

/**
 * Regime 切换元策略类
 */
export class RegimeSwitchingStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'RegimeSwitchingStrategy',
      ...params,
    });

    // 交易对
    this.symbol = params.symbol || 'BTC/USDT';

    // 基础仓位百分比
    this.basePositionPercent = params.positionPercent || 95;

    // ============================================
    // Regime 检测器参数
    // ============================================
    this.regimeParams = {
      adxPeriod: params.adxPeriod || 14,
      adxTrendThreshold: params.adxTrendThreshold || 25,
      adxStrongTrendThreshold: params.adxStrongTrendThreshold || 40,
      bbPeriod: params.bbPeriod || 20,
      bbStdDev: params.bbStdDev || 2,
      atrPeriod: params.atrPeriod || 14,
      lowVolPercentile: params.lowVolPercentile || 25,
      highVolPercentile: params.highVolPercentile || 75,
      extremeVolPercentile: params.extremeVolPercentile || 95,
      hurstPeriod: params.hurstPeriod || 100,
      minRegimeDuration: params.minRegimeDuration || 3,
    };

    // ============================================
    // 子策略参数
    // ============================================
    this.strategyParams = {
      SMA: params.smaParams || { fastPeriod: 10, slowPeriod: 30 },
      MACD: params.macdParams || { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      RSI: params.rsiParams || { period: 14, overbought: 70, oversold: 30 },
      BollingerBands: params.bbParams || { period: 20, stdDev: 2 },
      Grid: params.gridParams || { gridCount: 10, gridSpacing: 0.01 },
      ATRBreakout: params.atrBreakoutParams || { atrPeriod: 14, multiplier: 2 },
      WeightedCombo: params.weightedComboParams || {
        strategyWeights: { SMA: 0.4, RSI: 0.2, MACD: 0.4 },
        buyThreshold: 0.7,
        sellThreshold: 0.3,
        dynamicWeights: true,
        circuitBreaker: true,
      },
    };

    // ============================================
    // 自定义策略映射 (可覆盖默认)
    // ============================================
    this.customRegimeMap = params.regimeMap || null;

    // ============================================
    // 信号聚合设置
    // ============================================
    // 信号聚合模式: 'weighted' | 'majority' | 'any'
    this.signalAggregation = params.signalAggregation || 'weighted';
    // weighted 模式下的阈值
    this.weightedThreshold = params.weightedThreshold || 0.5;

    // ============================================
    // 风控设置
    // ============================================
    // 状态切换时是否平仓
    this.closeOnRegimeChange = params.closeOnRegimeChange !== false;
    // 极端情况时强制平仓
    this.forceCloseOnExtreme = params.forceCloseOnExtreme !== false;

    // ============================================
    // 内部状态
    // ============================================
    this._regimeDetector = null;
    this._subStrategies = {};
    this._activeStrategies = [];
    this._currentRegime = MarketRegime.RANGING;
    this._signalHistory = [];
    this._regimeStats = {
      changes: 0,
      byRegime: {},
    };
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    // 初始化 Regime 检测器
    this._regimeDetector = new MarketRegimeDetector(this.regimeParams);

    // 绑定 Regime 事件
    this._bindRegimeEvents();

    // 初始化所有可能用到的子策略
    await this._initSubStrategies();

    this.log(`Regime切换策略初始化完成`);
    this.log(`子策略: ${Object.keys(this._subStrategies).join(', ')}`);
    this.log(`信号聚合模式: ${this.signalAggregation}`);
  }

  /**
   * 绑定 Regime 事件
   * @private
   */
  _bindRegimeEvents() {
    this._regimeDetector.on(RegimeEvent.REGIME_CHANGE, (data) => {
      this._handleRegimeChange(data);
    });

    this._regimeDetector.on(RegimeEvent.EXTREME_DETECTED, (data) => {
      this.log(`⚠️ 极端波动检测! 进入风控模式`, 'warn');
      if (this.forceCloseOnExtreme) {
        this._forceCloseAllPositions('极端波动风控');
      }
    });

    this._regimeDetector.on(RegimeEvent.VOLATILITY_SPIKE, (data) => {
      this.log(`📈 波动率飙升! ATR百分位: ${data.indicators?.atrPercentile?.toFixed(0)}%`, 'warn');
    });

    this._regimeDetector.on(RegimeEvent.TREND_REVERSAL, (data) => {
      this.log(`🔄 趋势反转: ${data.from} → ${data.to}`);
    });
  }

  /**
   * 初始化子策略
   * @private
   */
  async _initSubStrategies() {
    const allStrategies = new Set();

    // 收集所有可能用到的策略
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP;
    for (const config of Object.values(regimeMap)) {
      config.strategies.forEach(s => allStrategies.add(s));
    }

    // 实例化策略
    for (const strategyName of allStrategies) {
      const StrategyClass = getStrategyClassMap()[strategyName];
      if (!StrategyClass) {
        this.log(`未知策略类: ${strategyName}`, 'warn');
        continue;
      }

      try {
        const params = {
          ...this.strategyParams[strategyName],
          symbol: this.symbol,
          positionPercent: this.basePositionPercent,
        };

        const strategy = new StrategyClass(params);
        strategy.engine = this.engine;
        await strategy.onInit();

        // 绑定信号事件
        strategy.on('signal', (signal) => {
          this._handleSubStrategySignal(strategyName, signal);
        });

        this._subStrategies[strategyName] = {
          instance: strategy,
          lastSignal: null,
          active: false,
        };

        this.log(`子策略 [${strategyName}] 初始化完成`);
      } catch (error) {
        this.log(`子策略 [${strategyName}] 初始化失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 1. 更新 Regime 检测器
    const regimeResult = this._regimeDetector.update(candle, history);

    // 保存指标
    this.setIndicator('regime', regimeResult.regime);
    this.setIndicator('regimeConfidence', regimeResult.confidence);
    this.setIndicator('regimeIndicators', regimeResult.indicators);
    this.setIndicator('recommendation', regimeResult.recommendation);

    // 2. 检查状态变化，更新活跃策略列表
    if (regimeResult.regime !== this._currentRegime) {
      this._currentRegime = regimeResult.regime;
      this._updateActiveStrategies();
    }

    // 3. 极端情况：停止交易
    if (this._currentRegime === MarketRegime.EXTREME) {
      this.setIndicator('tradingAllowed', false);
      return;
    }

    this.setIndicator('tradingAllowed', true);

    // 4. 调用活跃子策略的 onTick
    const signals = [];

    for (const strategyName of this._activeStrategies) {
      const strategyData = this._subStrategies[strategyName];
      if (!strategyData) continue;

      try {
        // 调用子策略
        await strategyData.instance.onTick(candle, history);

        // 获取信号
        const signal = strategyData.instance.getSignal();
        if (signal) {
          signals.push({
            strategy: strategyName,
            signal,
            weight: this._getStrategyWeight(strategyName),
          });
        }
      } catch (error) {
        this.log(`子策略 [${strategyName}] 执行错误: ${error.message}`, 'error');
      }
    }

    // 5. 聚合信号
    if (signals.length > 0) {
      const aggregatedSignal = this._aggregateSignals(signals);
      if (aggregatedSignal) {
        this._executeAggregatedSignal(aggregatedSignal, candle);
      }
    }
  }

  /**
   * 处理 Regime 变化
   * @private
   */
  _handleRegimeChange(data) {
    const { from, to, indicators } = data;

    this.log(`🔀 Regime切换: ${from} → ${to}`);
    this.log(`  ADX: ${indicators.adx?.toFixed(1)}, 波动百分位: ${indicators.volatilityIndex?.toFixed(0)}%`);

    // 更新统计
    this._regimeStats.changes++;
    if (!this._regimeStats.byRegime[to]) {
      this._regimeStats.byRegime[to] = 0;
    }
    this._regimeStats.byRegime[to]++;

    // 状态切换时平仓
    if (this.closeOnRegimeChange && from !== MarketRegime.EXTREME) {
      const position = this.getPosition(this.symbol);
      if (position && position.amount > 0) {
        this.log(`Regime切换，平仓现有持仓`);
        this.setSellSignal(`Regime Change: ${from} → ${to}`);
        this.closePosition(this.symbol);
      }
    }

    // 更新活跃策略
    this._updateActiveStrategies();
  }

  /**
   * 更新活跃策略列表
   * @private
   */
  _updateActiveStrategies() {
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP;
    const config = regimeMap[this._currentRegime];

    if (!config) {
      this._activeStrategies = [];
      return;
    }

    // 标记所有策略为非活跃
    for (const data of Object.values(this._subStrategies)) {
      data.active = false;
    }

    // 激活当前 Regime 的策略
    this._activeStrategies = config.strategies.filter(name => {
      const strategyData = this._subStrategies[name];
      if (strategyData) {
        strategyData.active = true;
        return true;
      }
      return false;
    });

    this.log(`活跃策略: [${this._activeStrategies.join(', ')}] (${config.description})`);
  }

  /**
   * 获取策略权重
   * @private
   */
  _getStrategyWeight(strategyName) {
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP;
    const config = regimeMap[this._currentRegime];

    if (config && config.weights && config.weights[strategyName]) {
      return config.weights[strategyName];
    }

    return 1 / this._activeStrategies.length; // 平均权重
  }

  /**
   * 处理子策略信号
   * @private
   */
  _handleSubStrategySignal(strategyName, signal) {
    const strategyData = this._subStrategies[strategyName];
    if (strategyData) {
      strategyData.lastSignal = {
        ...signal,
        timestamp: Date.now(),
      };
    }

    // 记录信号历史
    this._signalHistory.push({
      strategy: strategyName,
      signal,
      regime: this._currentRegime,
      timestamp: Date.now(),
    });

    // 保留最近 100 条
    if (this._signalHistory.length > 100) {
      this._signalHistory.shift();
    }
  }

  /**
   * 聚合信号
   * @private
   */
  _aggregateSignals(signals) {
    if (signals.length === 0) return null;

    switch (this.signalAggregation) {
      case 'weighted':
        return this._weightedAggregation(signals);

      case 'majority':
        return this._majorityAggregation(signals);

      case 'any':
        return this._anyAggregation(signals);

      default:
        return this._weightedAggregation(signals);
    }
  }

  /**
   * 加权聚合
   * @private
   */
  _weightedAggregation(signals) {
    let buyWeight = 0;
    let sellWeight = 0;
    const reasons = [];

    for (const { strategy, signal, weight } of signals) {
      if (signal.type === 'buy') {
        buyWeight += weight;
        reasons.push(`${strategy}:BUY`);
      } else if (signal.type === 'sell') {
        sellWeight += weight;
        reasons.push(`${strategy}:SELL`);
      }
    }

    if (buyWeight >= this.weightedThreshold && buyWeight > sellWeight) {
      return {
        type: 'buy',
        reason: `Weighted(${buyWeight.toFixed(2)}): ${reasons.join(', ')}`,
        weight: buyWeight,
      };
    }

    if (sellWeight >= this.weightedThreshold && sellWeight > buyWeight) {
      return {
        type: 'sell',
        reason: `Weighted(${sellWeight.toFixed(2)}): ${reasons.join(', ')}`,
        weight: sellWeight,
      };
    }

    return null;
  }

  /**
   * 多数决聚合
   * @private
   */
  _majorityAggregation(signals) {
    let buyCount = 0;
    let sellCount = 0;
    const reasons = [];

    for (const { strategy, signal } of signals) {
      if (signal.type === 'buy') {
        buyCount++;
        reasons.push(`${strategy}:BUY`);
      } else if (signal.type === 'sell') {
        sellCount++;
        reasons.push(`${strategy}:SELL`);
      }
    }

    const majority = Math.floor(signals.length / 2) + 1;

    if (buyCount >= majority) {
      return {
        type: 'buy',
        reason: `Majority(${buyCount}/${signals.length}): ${reasons.join(', ')}`,
        count: buyCount,
      };
    }

    if (sellCount >= majority) {
      return {
        type: 'sell',
        reason: `Majority(${sellCount}/${signals.length}): ${reasons.join(', ')}`,
        count: sellCount,
      };
    }

    return null;
  }

  /**
   * 任意信号聚合 (任一策略发出信号即执行)
   * @private
   */
  _anyAggregation(signals) {
    // 优先卖出信号 (风控优先)
    const sellSignal = signals.find(s => s.signal.type === 'sell');
    if (sellSignal) {
      return {
        type: 'sell',
        reason: `Any: ${sellSignal.strategy} SELL`,
        strategy: sellSignal.strategy,
      };
    }

    // 然后买入信号
    const buySignal = signals.find(s => s.signal.type === 'buy');
    if (buySignal) {
      return {
        type: 'buy',
        reason: `Any: ${buySignal.strategy} BUY`,
        strategy: buySignal.strategy,
      };
    }

    return null;
  }

  /**
   * 执行聚合后的信号
   * @private
   */
  _executeAggregatedSignal(signal, candle) {
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 获取推荐的仓位比例
    const recommendation = this._regimeDetector.getIndicators();
    const positionMultiplier = this._getStrategyRecommendation().positionSizing;
    const adjustedPositionPercent = this.basePositionPercent * positionMultiplier;

    if (signal.type === 'buy' && !hasPosition) {
      this.log(`📈 执行买入: ${signal.reason}, Regime=${this._currentRegime}, 仓位=${adjustedPositionPercent.toFixed(0)}%`);

      this.setState('entryRegime', this._currentRegime);
      this.setState('entryPrice', candle.close);

      this.setBuySignal(signal.reason);
      this.buyPercent(this.symbol, adjustedPositionPercent);

    } else if (signal.type === 'sell' && hasPosition) {
      this.log(`📉 执行卖出: ${signal.reason}, Regime=${this._currentRegime}`);

      this.setSellSignal(signal.reason);
      this.closePosition(this.symbol);
    }
  }

  /**
   * 强制平仓所有持仓
   * @private
   */
  _forceCloseAllPositions(reason) {
    const position = this.getPosition(this.symbol);
    if (position && position.amount > 0) {
      this.log(`🛑 强制平仓: ${reason}`);
      this.setSellSignal(`Force Close: ${reason}`);
      this.closePosition(this.symbol);
    }
  }

  /**
   * 获取策略推荐
   * @private
   */
  _getStrategyRecommendation() {
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP;
    const recommendation = this._regimeDetector.getIndicators();

    switch (this._currentRegime) {
      case MarketRegime.TRENDING_UP:
        return { positionSizing: 1.0, riskLevel: 'normal' };
      case MarketRegime.TRENDING_DOWN:
        return { positionSizing: 0.8, riskLevel: 'caution' };
      case MarketRegime.RANGING:
        return { positionSizing: 0.7, riskLevel: 'normal' };
      case MarketRegime.HIGH_VOLATILITY:
        return { positionSizing: 0.5, riskLevel: 'high' };
      case MarketRegime.EXTREME:
        return { positionSizing: 0, riskLevel: 'extreme' };
      default:
        return { positionSizing: 0.5, riskLevel: 'unknown' };
    }
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

    await super.onFinish();
  }

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取当前 Regime
   * @returns {string}
   */
  getCurrentRegime() {
    return this._currentRegime;
  }

  /**
   * 获取 Regime 检测器
   * @returns {MarketRegimeDetector}
   */
  getRegimeDetector() {
    return this._regimeDetector;
  }

  /**
   * 获取活跃策略列表
   * @returns {Array<string>}
   */
  getActiveStrategies() {
    return [...this._activeStrategies];
  }

  /**
   * 获取子策略实例
   * @param {string} name - 策略名称
   * @returns {BaseStrategy|null}
   */
  getSubStrategy(name) {
    const data = this._subStrategies[name];
    return data ? data.instance : null;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getRegimeStats() {
    return {
      currentRegime: this._currentRegime,
      activeStrategies: this._activeStrategies,
      regimeChanges: this._regimeStats.changes,
      regimeDistribution: this._regimeStats.byRegime,
      signalCount: this._signalHistory.length,
      detectorStats: this._regimeDetector?.getStats(),
    };
  }

  /**
   * 手动设置 Regime (测试用)
   * @param {string} regime - 目标 Regime
   */
  forceRegime(regime) {
    if (Object.values(MarketRegime).includes(regime)) {
      this.log(`手动强制切换 Regime: ${this._currentRegime} → ${regime}`);
      this._currentRegime = regime;
      this._updateActiveStrategies();
    }
  }
}

// 导出
export { MarketRegime, RegimeEvent };
export default RegimeSwitchingStrategy;
