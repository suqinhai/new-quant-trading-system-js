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

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { MarketRegimeDetector, MarketRegime, RegimeEvent } from '../utils/MarketRegimeDetector.js'; // 导入模块 ../utils/MarketRegimeDetector.js

// 子策略导入
import { SMAStrategy } from './SMAStrategy.js'; // 导入模块 ./SMAStrategy.js
import { MACDStrategy } from './MACDStrategy.js'; // 导入模块 ./MACDStrategy.js
import { RSIStrategy } from './RSIStrategy.js'; // 导入模块 ./RSIStrategy.js
import { BollingerBandsStrategy } from './BollingerBandsStrategy.js'; // 导入模块 ./BollingerBandsStrategy.js
import { GridStrategy } from './GridStrategy.js'; // 导入模块 ./GridStrategy.js
import { ATRBreakoutStrategy } from './ATRBreakoutStrategy.js'; // 导入模块 ./ATRBreakoutStrategy.js
import { WeightedComboStrategy } from './WeightedComboStrategy.js'; // 导入模块 ./WeightedComboStrategy.js

/**
 * 策略配置映射
 */
const REGIME_STRATEGY_MAP = { // 定义常量 REGIME_STRATEGY_MAP
  [MarketRegime.TRENDING_UP]: { // 执行语句
    strategies: ['SMA', 'MACD', 'WeightedCombo'], // 策略
    weights: { SMA: 0.35, MACD: 0.25, WeightedCombo: 0.4 }, // weights
    description: '上涨趋势策略组', // description
  }, // 结束代码块
  [MarketRegime.TRENDING_DOWN]: { // 执行语句
    strategies: ['SMA', 'MACD', 'WeightedCombo'], // 策略
    weights: { SMA: 0.35, MACD: 0.25, WeightedCombo: 0.4 }, // weights
    description: '下跌趋势策略组', // description
  }, // 结束代码块
  [MarketRegime.RANGING]: { // 执行语句
    strategies: ['RSI', 'BollingerBands', 'Grid', 'WeightedCombo'], // 策略
    weights: { RSI: 0.2, BollingerBands: 0.25, Grid: 0.2, WeightedCombo: 0.35 }, // weights
    description: '震荡策略组', // description
  }, // 结束代码块
  [MarketRegime.HIGH_VOLATILITY]: { // 执行语句
    strategies: ['ATRBreakout', 'WeightedCombo'], // 策略
    weights: { ATRBreakout: 0.5, WeightedCombo: 0.5 }, // weights
    description: '高波动策略组', // description
  }, // 结束代码块
  [MarketRegime.EXTREME]: { // 执行语句
    strategies: [], // 策略
    weights: {}, // weights
    description: '风控模式 - 停止交易', // description
  }, // 结束代码块
}; // 结束代码块

/**
 * 获取策略类映射
 * 使用函数形式延迟获取策略类，避免循环依赖问题
 */
function getStrategyClassMap() { // 定义函数 getStrategyClassMap
  return { // 返回结果
    SMA: SMAStrategy, // SMA
    MACD: MACDStrategy, // MACD
    RSI: RSIStrategy, // RSI
    BollingerBands: BollingerBandsStrategy, // 布林带Bands
    Grid: GridStrategy, // 网格
    ATRBreakout: ATRBreakoutStrategy, // ATR突破
    WeightedCombo: WeightedComboStrategy, // WeightedCombo
  }; // 结束代码块
} // 结束代码块

/**
 * Regime 切换元策略类
 */
export class RegimeSwitchingStrategy extends BaseStrategy { // 导出类 RegimeSwitchingStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'RegimeSwitchingStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // 交易对
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 基础仓位百分比
    this.basePositionPercent = params.positionPercent || 95; // 设置 basePositionPercent

    // ============================================
    // Regime 检测器参数
    // ============================================
    this.regimeParams = { // 设置 regimeParams
      adxPeriod: params.adxPeriod || 14, // ADX周期
      adxTrendThreshold: params.adxTrendThreshold || 25, // ADXTrend阈值
      adxStrongTrendThreshold: params.adxStrongTrendThreshold || 40, // ADXStrongTrend阈值
      bbPeriod: params.bbPeriod || 20, // 布林带周期
      bbStdDev: params.bbStdDev || 2, // 布林带标准差
      atrPeriod: params.atrPeriod || 14, // ATR周期
      lowVolPercentile: params.lowVolPercentile || 25, // 最低波动率Percentile
      highVolPercentile: params.highVolPercentile || 80, // 最高波动率Percentile
      extremeVolPercentile: params.extremeVolPercentile || 98, // 极端波动率Percentile
      hurstPeriod: params.hurstPeriod || 100, // hurst周期
      minRegimeDuration: params.minRegimeDuration || 5, // 最小状态Duration
    }; // 结束代码块

    // ============================================
    // 子策略参数
    // ============================================
    this.strategyParams = { // 设置 strategyParams
      SMA: params.smaParams || { fastPeriod: 10, slowPeriod: 30 }, // SMA
      MACD: params.macdParams || { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, // MACD
      RSI: params.rsiParams || { period: 14, overbought: 70, oversold: 30 }, // RSI
      BollingerBands: params.bbParams || { period: 20, stdDev: 2 }, // 布林带Bands
      Grid: params.gridParams || { gridCount: 10, gridSpacing: 0.01 }, // 网格
      ATRBreakout: params.atrBreakoutParams || { atrPeriod: 14, multiplier: 2 }, // ATR突破
      WeightedCombo: params.weightedComboParams || { // WeightedCombo
        strategyWeights: { SMA: 0.4, RSI: 0.2, MACD: 0.4 }, // 策略Weights
        buyThreshold: 0.6, // buy阈值
        sellThreshold: 0.4, // sell阈值
        dynamicWeights: true, // dynamicWeights
        circuitBreaker: true, // circuitBreaker
      }, // 结束代码块
    }; // 结束代码块

    // ============================================
    // 自定义策略映射 (可覆盖默认)
    // ============================================
    this.customRegimeMap = params.regimeMap || null; // 设置 customRegimeMap

    // ============================================
    // 信号聚合设置
    // ============================================
    // 信号聚合模式: 'weighted' | 'majority' | 'any'
    this.signalAggregation = params.signalAggregation || 'weighted'; // 设置 signalAggregation
    // weighted 模式下的阈值
    this.weightedThreshold = params.weightedThreshold || 0.5; // 设置 weightedThreshold

    // ============================================
    // 风控设置
    // ============================================
    // 状态切换时是否平仓
    this.closeOnRegimeChange = params.closeOnRegimeChange !== false; // 设置 closeOnRegimeChange
    // 极端情况时强制平仓
    this.forceCloseOnExtreme = params.forceCloseOnExtreme !== false; // 设置 forceCloseOnExtreme

    // ============================================
    // 内部状态
    // ============================================
    this._regimeDetector = null; // 设置 _regimeDetector
    this._subStrategies = {}; // 设置 _subStrategies
    this._activeStrategies = []; // 设置 _activeStrategies
    this._currentRegime = MarketRegime.RANGING; // 设置 _currentRegime
    this._signalHistory = []; // 设置 _signalHistory
    this._regimeStats = { // 设置 _regimeStats
      changes: 0, // 变更
      byRegime: {}, // by状态
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // Regime 切换策略管理子策略，只需要 K 线数据 / Regime switching manages sub-strategies, only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  async onInit(exchanges) { // 执行语句
    // 保存交易所引用 / Save exchanges reference
    this._exchanges = exchanges; // 设置 _exchanges

    await super.onInit(); // 等待异步结果

    // 初始化 Regime 检测器
    this._regimeDetector = new MarketRegimeDetector(this.regimeParams); // 设置 _regimeDetector

    // 绑定 Regime 事件
    this._bindRegimeEvents(); // 调用 _bindRegimeEvents

    // 初始化所有可能用到的子策略
    await this._initSubStrategies(); // 等待异步结果

    this.log(`Regime切换策略初始化完成`); // 调用 log
    this.log(`子策略: ${Object.keys(this._subStrategies).join(', ')}`); // 调用 log
    this.log(`信号聚合模式: ${this.signalAggregation}`); // 调用 log
  } // 结束代码块

  /**
   * 绑定 Regime 事件
   * @private
   */
  _bindRegimeEvents() { // 调用 _bindRegimeEvents
    this._regimeDetector.on(RegimeEvent.REGIME_CHANGE, (data) => { // 访问 _regimeDetector
      this._handleRegimeChange(data); // 调用 _handleRegimeChange
    }); // 结束代码块

    this._regimeDetector.on(RegimeEvent.EXTREME_DETECTED, (data) => { // 访问 _regimeDetector
      this.log(`⚠️ 极端波动检测! 进入风控模式`, 'warn'); // 调用 log
      if (this.forceCloseOnExtreme) { // 条件判断 this.forceCloseOnExtreme
        this._forceCloseAllPositions('极端波动风控'); // 调用 _forceCloseAllPositions
      } // 结束代码块
    }); // 结束代码块

    this._regimeDetector.on(RegimeEvent.VOLATILITY_SPIKE, (data) => { // 访问 _regimeDetector
      this.log(`📈 波动率飙升! ATR百分位: ${data.indicators?.atrPercentile?.toFixed(0)}%`, 'warn'); // 调用 log
    }); // 结束代码块

    this._regimeDetector.on(RegimeEvent.TREND_REVERSAL, (data) => { // 访问 _regimeDetector
      this.log(`🔄 趋势反转: ${data.from} → ${data.to}`); // 调用 log
    }); // 结束代码块
  } // 结束代码块

  /**
   * 初始化子策略
   * @private
   */
  async _initSubStrategies() { // 执行语句
    const allStrategies = new Set(); // 定义常量 allStrategies

    // 收集所有可能用到的策略
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP; // 定义常量 regimeMap
    for (const config of Object.values(regimeMap)) { // 循环 const config of Object.values(regimeMap)
      config.strategies.forEach(s => allStrategies.add(s)); // 调用 config.strategies.forEach
    } // 结束代码块

    // 实例化策略
    for (const strategyName of allStrategies) { // 循环 const strategyName of allStrategies
      const StrategyClass = getStrategyClassMap()[strategyName]; // 定义常量 StrategyClass
      if (!StrategyClass) { // 条件判断 !StrategyClass
        this.log(`未知策略类: ${strategyName}`, 'warn'); // 调用 log
        continue; // 继续下一轮循环
      } // 结束代码块

      try { // 尝试执行
        const params = { // 定义常量 params
          ...this.strategyParams[strategyName], // 展开对象或数组
          symbol: this.symbol, // 交易对
          positionPercent: this.basePositionPercent, // 持仓百分比
        }; // 结束代码块

        const strategy = new StrategyClass(params); // 定义常量 strategy
        strategy.engine = this.engine; // 赋值 strategy.engine

        // 传递交易所引用给子策略 / Pass exchanges to sub-strategy
        await strategy.onInit(this._exchanges); // 等待异步结果

        // 绑定信号事件
        strategy.on('signal', (signal) => { // 注册事件监听
          this._handleSubStrategySignal(strategyName, signal); // 调用 _handleSubStrategySignal
        }); // 结束代码块

        this._subStrategies[strategyName] = { // 访问 _subStrategies
          instance: strategy, // instance
          lastSignal: null, // last信号
          active: false, // 活跃
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
    for (const [name, data] of Object.entries(this._subStrategies)) { // 循环 const [name, data] of Object.entries(this._su...
      if (data.instance && typeof data.instance.initCandleHistory === 'function') { // 条件判断 data.instance && typeof data.instance.initCan...
        try { // 尝试执行
          data.instance.initCandleHistory(symbol, candles); // 调用 data.instance.initCandleHistory
        } catch (error) { // 执行语句
          this.log(`子策略 [${name}] 初始化历史数据失败: ${error.message}`, 'warn'); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 1. 更新 Regime 检测器
    const regimeResult = this._regimeDetector.update(candle, history); // 定义常量 regimeResult

    // 保存指标
    this.setIndicator('regime', regimeResult.regime); // 调用 setIndicator
    this.setIndicator('regimeConfidence', regimeResult.confidence); // 调用 setIndicator
    this.setIndicator('regimeIndicators', regimeResult.indicators); // 调用 setIndicator
    this.setIndicator('recommendation', regimeResult.recommendation); // 调用 setIndicator

    // 2. 检查状态变化，更新活跃策略列表
    if (regimeResult.regime !== this._currentRegime) { // 条件判断 regimeResult.regime !== this._currentRegime
      this._currentRegime = regimeResult.regime; // 设置 _currentRegime
      this._updateActiveStrategies(); // 调用 _updateActiveStrategies
    } // 结束代码块

    // 3. 极端情况：停止交易
    if (this._currentRegime === MarketRegime.EXTREME) { // 条件判断 this._currentRegime === MarketRegime.EXTREME
      this.setIndicator('tradingAllowed', false); // 调用 setIndicator
      return; // 返回结果
    } // 结束代码块

    this.setIndicator('tradingAllowed', true); // 调用 setIndicator

    // 4. 调用活跃子策略的 onTick
    const signals = []; // 定义常量 signals

    for (const strategyName of this._activeStrategies) { // 循环 const strategyName of this._activeStrategies
      const strategyData = this._subStrategies[strategyName]; // 定义常量 strategyData
      if (!strategyData) continue; // 条件判断 !strategyData

      try { // 尝试执行
        // 调用子策略
        await strategyData.instance.onTick(candle, history); // 等待异步结果

        // 获取信号
        const signal = strategyData.instance.getSignal(); // 定义常量 signal
        if (signal) { // 条件判断 signal
          signals.push({ // 调用 signals.push
            strategy: strategyName, // 策略
            signal, // 执行语句
            weight: this._getStrategyWeight(strategyName), // weight
          }); // 结束代码块
        } // 结束代码块
      } catch (error) { // 执行语句
        this.log(`子策略 [${strategyName}] 执行错误: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 5. 聚合信号
    if (signals.length > 0) { // 条件判断 signals.length > 0
      const aggregatedSignal = this._aggregateSignals(signals); // 定义常量 aggregatedSignal
      if (aggregatedSignal) { // 条件判断 aggregatedSignal
        this._executeAggregatedSignal(aggregatedSignal, candle); // 调用 _executeAggregatedSignal
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Regime 变化
   * @private
   */
  _handleRegimeChange(data) { // 调用 _handleRegimeChange
    const { from, to, indicators } = data; // 解构赋值

    this.log(`🔀 Regime切换: ${from} → ${to}`); // 调用 log
    this.log(`  ADX: ${indicators.adx?.toFixed(1)}, 波动百分位: ${indicators.volatilityIndex?.toFixed(0)}%`); // 调用 log

    // 更新统计
    this._regimeStats.changes++; // 访问 _regimeStats
    if (!this._regimeStats.byRegime[to]) { // 条件判断 !this._regimeStats.byRegime[to]
      this._regimeStats.byRegime[to] = 0; // 访问 _regimeStats
    } // 结束代码块
    this._regimeStats.byRegime[to]++; // 访问 _regimeStats

    // 状态切换时平仓
    if (this.closeOnRegimeChange && from !== MarketRegime.EXTREME) { // 条件判断 this.closeOnRegimeChange && from !== MarketRe...
      const position = this.getPosition(this.symbol); // 定义常量 position
      if (position && position.amount > 0) { // 条件判断 position && position.amount > 0
        this.log(`Regime切换，平仓现有持仓`); // 调用 log
        this.setSellSignal(`Regime Change: ${from} → ${to}`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
      } // 结束代码块
    } // 结束代码块

    // 更新活跃策略
    this._updateActiveStrategies(); // 调用 _updateActiveStrategies
  } // 结束代码块

  /**
   * 更新活跃策略列表
   * @private
   */
  _updateActiveStrategies() { // 调用 _updateActiveStrategies
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP; // 定义常量 regimeMap
    const config = regimeMap[this._currentRegime]; // 定义常量 config

    if (!config) { // 条件判断 !config
      this._activeStrategies = []; // 设置 _activeStrategies
      return; // 返回结果
    } // 结束代码块

    // 标记所有策略为非活跃
    for (const data of Object.values(this._subStrategies)) { // 循环 const data of Object.values(this._subStrategies)
      data.active = false; // 赋值 data.active
    } // 结束代码块

    // 激活当前 Regime 的策略
    this._activeStrategies = config.strategies.filter(name => { // 设置 _activeStrategies
      const strategyData = this._subStrategies[name]; // 定义常量 strategyData
      if (strategyData) { // 条件判断 strategyData
        strategyData.active = true; // 赋值 strategyData.active
        return true; // 返回结果
      } // 结束代码块
      return false; // 返回结果
    }); // 结束代码块

    this.log(`活跃策略: [${this._activeStrategies.join(', ')}] (${config.description})`); // 调用 log
  } // 结束代码块

  /**
   * 获取策略权重
   * @private
   */
  _getStrategyWeight(strategyName) { // 调用 _getStrategyWeight
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP; // 定义常量 regimeMap
    const config = regimeMap[this._currentRegime]; // 定义常量 config

    if (config && config.weights && config.weights[strategyName]) { // 条件判断 config && config.weights && config.weights[st...
      return config.weights[strategyName]; // 返回结果
    } // 结束代码块

    return 1 / this._activeStrategies.length; // 平均权重
  } // 结束代码块

  /**
   * 处理子策略信号
   * @private
   */
  _handleSubStrategySignal(strategyName, signal) { // 调用 _handleSubStrategySignal
    const strategyData = this._subStrategies[strategyName]; // 定义常量 strategyData
    if (strategyData) { // 条件判断 strategyData
      strategyData.lastSignal = { // 赋值 strategyData.lastSignal
        ...signal, // 展开对象或数组
        timestamp: Date.now(), // 时间戳
      }; // 结束代码块
    } // 结束代码块

    // 记录信号历史
    this._signalHistory.push({ // 访问 _signalHistory
      strategy: strategyName, // 策略
      signal, // 执行语句
      regime: this._currentRegime, // 状态
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近 100 条
    if (this._signalHistory.length > 100) { // 条件判断 this._signalHistory.length > 100
      this._signalHistory.shift(); // 访问 _signalHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 聚合信号
   * @private
   */
  _aggregateSignals(signals) { // 调用 _aggregateSignals
    if (signals.length === 0) return null; // 条件判断 signals.length === 0

    switch (this.signalAggregation) { // 分支选择 this.signalAggregation
      case 'weighted': // 分支 'weighted'
        return this._weightedAggregation(signals); // 返回结果

      case 'majority': // 分支 'majority'
        return this._majorityAggregation(signals); // 返回结果

      case 'any': // 分支 'any'
        return this._anyAggregation(signals); // 返回结果

      default: // 默认
        return this._weightedAggregation(signals); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 加权聚合
   * @private
   */
  _weightedAggregation(signals) { // 调用 _weightedAggregation
    let buyWeight = 0; // 定义变量 buyWeight
    let sellWeight = 0; // 定义变量 sellWeight
    const reasons = []; // 定义常量 reasons

    for (const { strategy, signal, weight } of signals) { // 循环 const { strategy, signal, weight } of signals
      if (signal.type === 'buy') { // 条件判断 signal.type === 'buy'
        buyWeight += weight; // 执行语句
        reasons.push(`${strategy}:BUY`); // 调用 reasons.push
      } else if (signal.type === 'sell') { // 执行语句
        sellWeight += weight; // 执行语句
        reasons.push(`${strategy}:SELL`); // 调用 reasons.push
      } // 结束代码块
    } // 结束代码块

    if (buyWeight >= this.weightedThreshold && buyWeight > sellWeight) { // 条件判断 buyWeight >= this.weightedThreshold && buyWei...
      return { // 返回结果
        type: 'buy', // 类型
        reason: `Weighted(${buyWeight.toFixed(2)}): ${reasons.join(', ')}`, // reason
        weight: buyWeight, // weight
      }; // 结束代码块
    } // 结束代码块

    if (sellWeight >= this.weightedThreshold && sellWeight > buyWeight) { // 条件判断 sellWeight >= this.weightedThreshold && sellW...
      return { // 返回结果
        type: 'sell', // 类型
        reason: `Weighted(${sellWeight.toFixed(2)}): ${reasons.join(', ')}`, // reason
        weight: sellWeight, // weight
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 多数决聚合
   * @private
   */
  _majorityAggregation(signals) { // 调用 _majorityAggregation
    let buyCount = 0; // 定义变量 buyCount
    let sellCount = 0; // 定义变量 sellCount
    const reasons = []; // 定义常量 reasons

    for (const { strategy, signal } of signals) { // 循环 const { strategy, signal } of signals
      if (signal.type === 'buy') { // 条件判断 signal.type === 'buy'
        buyCount++; // 执行语句
        reasons.push(`${strategy}:BUY`); // 调用 reasons.push
      } else if (signal.type === 'sell') { // 执行语句
        sellCount++; // 执行语句
        reasons.push(`${strategy}:SELL`); // 调用 reasons.push
      } // 结束代码块
    } // 结束代码块

    const majority = Math.floor(signals.length / 2) + 1; // 定义常量 majority

    if (buyCount >= majority) { // 条件判断 buyCount >= majority
      return { // 返回结果
        type: 'buy', // 类型
        reason: `Majority(${buyCount}/${signals.length}): ${reasons.join(', ')}`, // reason
        count: buyCount, // 数量
      }; // 结束代码块
    } // 结束代码块

    if (sellCount >= majority) { // 条件判断 sellCount >= majority
      return { // 返回结果
        type: 'sell', // 类型
        reason: `Majority(${sellCount}/${signals.length}): ${reasons.join(', ')}`, // reason
        count: sellCount, // 数量
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 任意信号聚合 (任一策略发出信号即执行)
   * @private
   */
  _anyAggregation(signals) { // 调用 _anyAggregation
    // 优先卖出信号 (风控优先)
    const sellSignal = signals.find(s => s.signal.type === 'sell'); // 定义函数 sellSignal
    if (sellSignal) { // 条件判断 sellSignal
      return { // 返回结果
        type: 'sell', // 类型
        reason: `Any: ${sellSignal.strategy} SELL`, // reason
        strategy: sellSignal.strategy, // 策略
      }; // 结束代码块
    } // 结束代码块

    // 然后买入信号
    const buySignal = signals.find(s => s.signal.type === 'buy'); // 定义函数 buySignal
    if (buySignal) { // 条件判断 buySignal
      return { // 返回结果
        type: 'buy', // 类型
        reason: `Any: ${buySignal.strategy} BUY`, // reason
        strategy: buySignal.strategy, // 策略
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 执行聚合后的信号
   * @private
   */
  _executeAggregatedSignal(signal, candle) { // 调用 _executeAggregatedSignal
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // 获取推荐的仓位比例
    const recommendation = this._regimeDetector.getIndicators(); // 定义常量 recommendation
    const positionMultiplier = this._getStrategyRecommendation().positionSizing; // 定义常量 positionMultiplier
    const adjustedPositionPercent = this.basePositionPercent * positionMultiplier; // 定义常量 adjustedPositionPercent

    if (signal.type === 'buy' && !hasPosition) { // 条件判断 signal.type === 'buy' && !hasPosition
      this.log(`📈 执行买入: ${signal.reason}, Regime=${this._currentRegime}, 仓位=${adjustedPositionPercent.toFixed(0)}%`); // 调用 log

      this.setState('entryRegime', this._currentRegime); // 调用 setState
      this.setState('entryPrice', candle.close); // 调用 setState

      this.setBuySignal(signal.reason); // 调用 setBuySignal
      this.buyPercent(this.symbol, adjustedPositionPercent); // 调用 buyPercent

    } else if (signal.type === 'sell' && hasPosition) { // 执行语句
      this.log(`📉 执行卖出: ${signal.reason}, Regime=${this._currentRegime}`); // 调用 log

      this.setSellSignal(signal.reason); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
    } // 结束代码块
  } // 结束代码块

  /**
   * 强制平仓所有持仓
   * @private
   */
  _forceCloseAllPositions(reason) { // 调用 _forceCloseAllPositions
    const position = this.getPosition(this.symbol); // 定义常量 position
    if (position && position.amount > 0) { // 条件判断 position && position.amount > 0
      this.log(`🛑 强制平仓: ${reason}`); // 调用 log
      this.setSellSignal(`Force Close: ${reason}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取策略推荐
   * @private
   */
  _getStrategyRecommendation() { // 调用 _getStrategyRecommendation
    const regimeMap = this.customRegimeMap || REGIME_STRATEGY_MAP; // 定义常量 regimeMap
    const recommendation = this._regimeDetector.getIndicators(); // 定义常量 recommendation

    switch (this._currentRegime) { // 分支选择 this._currentRegime
      case MarketRegime.TRENDING_UP: // 分支 MarketRegime.TRENDING_UP
        return { positionSizing: 1.0, riskLevel: 'normal' }; // 返回结果
      case MarketRegime.TRENDING_DOWN: // 分支 MarketRegime.TRENDING_DOWN
        return { positionSizing: 0.8, riskLevel: 'caution' }; // 返回结果
      case MarketRegime.RANGING: // 分支 MarketRegime.RANGING
        return { positionSizing: 0.7, riskLevel: 'normal' }; // 返回结果
      case MarketRegime.HIGH_VOLATILITY: // 分支 MarketRegime.HIGH_VOLATILITY
        return { positionSizing: 0.5, riskLevel: 'high' }; // 返回结果
      case MarketRegime.EXTREME: // 分支 MarketRegime.EXTREME
        return { positionSizing: 0, riskLevel: 'extreme' }; // 返回结果
      default: // 默认
        return { positionSizing: 0.5, riskLevel: 'unknown' }; // 返回结果
    } // 结束代码块
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

    await super.onFinish(); // 等待异步结果
  } // 结束代码块

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取当前 Regime
   * @returns {string}
   */
  getCurrentRegime() { // 调用 getCurrentRegime
    return this._currentRegime; // 返回结果
  } // 结束代码块

  /**
   * 获取 Regime 检测器
   * @returns {MarketRegimeDetector}
   */
  getRegimeDetector() { // 调用 getRegimeDetector
    return this._regimeDetector; // 返回结果
  } // 结束代码块

  /**
   * 获取活跃策略列表
   * @returns {Array<string>}
   */
  getActiveStrategies() { // 调用 getActiveStrategies
    return [...this._activeStrategies]; // 返回结果
  } // 结束代码块

  /**
   * 获取子策略实例
   * @param {string} name - 策略名称
   * @returns {BaseStrategy|null}
   */
  getSubStrategy(name) { // 调用 getSubStrategy
    const data = this._subStrategies[name]; // 定义常量 data
    return data ? data.instance : null; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getRegimeStats() { // 调用 getRegimeStats
    return { // 返回结果
      currentRegime: this._currentRegime, // current状态
      activeStrategies: this._activeStrategies, // 活跃策略
      regimeChanges: this._regimeStats.changes, // 状态变更
      regimeDistribution: this._regimeStats.byRegime, // 状态Distribution
      signalCount: this._signalHistory.length, // 信号数量
      detectorStats: this._regimeDetector?.getStats(), // detectorStats
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动设置 Regime (测试用)
   * @param {string} regime - 目标 Regime
   */
  forceRegime(regime) { // 调用 forceRegime
    if (Object.values(MarketRegime).includes(regime)) { // 条件判断 Object.values(MarketRegime).includes(regime)
      this.log(`手动强制切换 Regime: ${this._currentRegime} → ${regime}`); // 调用 log
      this._currentRegime = regime; // 设置 _currentRegime
      this._updateActiveStrategies(); // 调用 _updateActiveStrategies
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出
export { MarketRegime, RegimeEvent }; // 导出命名成员
export default RegimeSwitchingStrategy; // 默认导出
