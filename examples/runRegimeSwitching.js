/**
 * Regime Switching 元策略运行示例
 * Market Regime Switching Meta Strategy Example
 *
 * 此示例展示如何使用 RegimeSwitchingStrategy，
 * 该策略根据市场状态自动切换子策略组合。
 *
 * 市场状态类型：
 * - trending_up: 上涨趋势 → SMA/MACD 策略
 * - trending_down: 下跌趋势 → SMA/MACD 策略
 * - ranging: 震荡盘整 → RSI/布林带/网格策略
 * - high_volatility: 高波动 → ATR突破策略
 * - extreme: 极端情况 → 停止交易，风控模式
 */

import {
  RegimeSwitchingStrategy,
  MarketRegime,
  RegimeEvent,
} from '../src/strategies/RegimeSwitchingStrategy.js';
import { MarketRegimeDetector } from '../src/utils/MarketRegimeDetector.js';

// ============================================
// 配置参数
// ============================================

const config = {
  // 基础配置
  symbol: 'BTC/USDT',
  timeframe: '1h',
  positionPercent: 95,

  // 信号聚合配置
  signalAggregation: 'weighted', // 'weighted' | 'majority' | 'any'
  weightedThreshold: 0.5, // 加权信号阈值

  // Regime 检测参数
  regimeParams: {
    adxPeriod: 14,
    adxTrendThreshold: 25,
    adxStrongTrendThreshold: 40,
    bbPeriod: 20,
    atrPeriod: 14,
    lowVolPercentile: 25,
    highVolPercentile: 75,
    extremeVolPercentile: 95,
    hurstPeriod: 50,
    minRegimeDuration: 3, // 状态确认需要的 K 线数量
  },

  // 子策略参数
  strategyParams: {
    SMA: {
      shortPeriod: 10,
      longPeriod: 30,
    },
    MACD: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },
    RSI: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },
    BollingerBands: {
      period: 20,
      stdDev: 2,
    },
    Grid: {
      gridCount: 10,
      gridSpacing: 0.01,
    },
    ATRBreakout: {
      atrPeriod: 14,
      atrMultiplier: 2.0,
    },
  },

  // 风控配置
  closeOnRegimeChange: true, // 状态切换时平仓
  forceCloseOnExtreme: true, // 极端情况强制平仓
};

// ============================================
// 自定义 Regime 映射（可选）
// ============================================

const customRegimeMap = {
  [MarketRegime.TRENDING_UP]: {
    strategies: ['SMA', 'MACD'],
    weights: { SMA: 0.6, MACD: 0.4 },
  },
  [MarketRegime.TRENDING_DOWN]: {
    strategies: ['SMA', 'MACD'],
    weights: { SMA: 0.6, MACD: 0.4 },
  },
  [MarketRegime.RANGING]: {
    strategies: ['RSI', 'BollingerBands'],
    weights: { RSI: 0.5, BollingerBands: 0.5 },
  },
  [MarketRegime.HIGH_VOLATILITY]: {
    strategies: ['ATRBreakout'],
    weights: { ATRBreakout: 1.0 },
  },
  [MarketRegime.EXTREME]: {
    strategies: [],
    weights: {},
  },
};

// ============================================
// 示例 1: 基础用法
// ============================================

async function basicExample() {
  console.log('='.repeat(50));
  console.log('示例 1: 基础用法');
  console.log('='.repeat(50));

  // 创建策略实例
  const strategy = new RegimeSwitchingStrategy({
    symbol: 'BTC/USDT',
    positionPercent: 95,
    signalAggregation: 'weighted',
    weightedThreshold: 0.5,
  });

  // 监听事件
  strategy.on('signal', (signal) => {
    console.log(`[信号] ${signal.type.toUpperCase()} @ ${signal.price}`);
    console.log(`  来源策略: ${signal.source}`);
    console.log(`  置信度: ${(signal.confidence * 100).toFixed(1)}%`);
  });

  strategy.on('regime_change', (event) => {
    console.log(`[状态切换] ${event.from} → ${event.to}`);
    console.log(`  活跃策略: ${event.activeStrategies.join(', ')}`);
  });

  // 获取当前状态
  console.log(`当前状态: ${strategy.getCurrentRegime()}`);
  console.log(`活跃策略: ${strategy.getActiveStrategies().join(', ')}`);

  return strategy;
}

// ============================================
// 示例 2: 使用自定义 Regime 映射
// ============================================

async function customRegimeMapExample() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 2: 自定义 Regime 映射');
  console.log('='.repeat(50));

  const strategy = new RegimeSwitchingStrategy({
    symbol: 'ETH/USDT',
    positionPercent: 80,
    signalAggregation: 'majority',
    regimeMap: customRegimeMap,
  });

  console.log('自定义映射已应用');

  // 强制切换到特定状态（测试用）
  strategy.forceRegime(MarketRegime.RANGING);
  console.log(`强制切换到: ${strategy.getCurrentRegime()}`);
  console.log(`活跃策略: ${strategy.getActiveStrategies().join(', ')}`);

  return strategy;
}

// ============================================
// 示例 3: 独立使用 MarketRegimeDetector
// ============================================

async function detectorExample() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 3: 独立使用 MarketRegimeDetector');
  console.log('='.repeat(50));

  const detector = new MarketRegimeDetector({
    adxPeriod: 14,
    adxTrendThreshold: 25,
    bbPeriod: 20,
    atrPeriod: 14,
    minRegimeDuration: 3,
  });

  // 监听事件
  detector.on(RegimeEvent.REGIME_CHANGE, (event) => {
    console.log(`[Regime Change] ${event.from} → ${event.to}`);
  });

  detector.on(RegimeEvent.EXTREME_DETECTED, (event) => {
    console.log(`[ALERT] 极端市场情况检测！`);
    console.log(`  波动率指数: ${event.volatilityIndex}`);
  });

  detector.on(RegimeEvent.VOLATILITY_SPIKE, (event) => {
    console.log(`[警告] 波动率急升: ${event.increase.toFixed(1)}%`);
  });

  // 生成模拟数据
  const candles = generateMockCandles(150, 50000, 'trending_up');

  // 更新检测器
  let lastResult;
  for (let i = 50; i < candles.length; i++) {
    lastResult = detector.update(candles[i], candles.slice(0, i + 1));
  }

  if (lastResult) {
    console.log('\n最终检测结果:');
    console.log(`  状态: ${lastResult.regime}`);
    console.log(`  置信度: ${lastResult.confidence}%`);
    console.log(`  趋势方向: ${lastResult.indicators.trendDirection}`);
    console.log(`  ADX: ${lastResult.indicators.adx?.toFixed(2)}`);
    console.log(`  Hurst: ${lastResult.indicators.hurst?.toFixed(3)}`);
    console.log(`  波动率百分位: ${lastResult.indicators.volatilityIndex?.toFixed(1)}%`);
    console.log(`\n推荐策略: ${lastResult.recommendation.strategies.join(', ')}`);
    console.log(`建议仓位: ${(lastResult.recommendation.positionSizing * 100).toFixed(0)}%`);
    console.log(`风险等级: ${lastResult.recommendation.riskLevel}`);
  }

  return detector;
}

// ============================================
// 示例 4: 完整交易流程
// ============================================

async function fullTradingExample() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 4: 完整交易流程模拟');
  console.log('='.repeat(50));

  const strategy = new RegimeSwitchingStrategy(config);

  // 统计
  const stats = {
    signals: { buy: 0, sell: 0 },
    regimeChanges: 0,
    regimeHistory: [],
  };

  // 监听信号
  strategy.on('signal', (signal) => {
    stats.signals[signal.type]++;
  });

  strategy.on('regime_change', (event) => {
    stats.regimeChanges++;
    stats.regimeHistory.push({
      from: event.from,
      to: event.to,
      timestamp: new Date().toISOString(),
    });
  });

  // 模拟市场周期
  console.log('\n模拟市场周期...');

  // 阶段 1: 震荡期
  console.log('\n[阶段 1] 震荡盘整期');
  const rangingCandles = generateMockCandles(50, 50000, 'ranging');
  await processCandles(strategy, rangingCandles);
  console.log(`  当前状态: ${strategy.getCurrentRegime()}`);

  // 阶段 2: 上涨趋势
  console.log('\n[阶段 2] 上涨趋势期');
  const trendingUpCandles = generateMockCandles(50, 51000, 'trending_up');
  await processCandles(strategy, trendingUpCandles);
  console.log(`  当前状态: ${strategy.getCurrentRegime()}`);

  // 阶段 3: 高波动期
  console.log('\n[阶段 3] 高波动期');
  const highVolCandles = generateMockCandles(30, 55000, 'high_volatility');
  await processCandles(strategy, highVolCandles);
  console.log(`  当前状态: ${strategy.getCurrentRegime()}`);

  // 阶段 4: 回归震荡
  console.log('\n[阶段 4] 回归震荡期');
  const backToRangingCandles = generateMockCandles(30, 54000, 'ranging');
  await processCandles(strategy, backToRangingCandles);
  console.log(`  当前状态: ${strategy.getCurrentRegime()}`);

  // 输出统计
  console.log('\n' + '-'.repeat(40));
  console.log('交易统计:');
  console.log(`  买入信号: ${stats.signals.buy}`);
  console.log(`  卖出信号: ${stats.signals.sell}`);
  console.log(`  状态切换: ${stats.regimeChanges} 次`);

  const regimeStats = strategy.getRegimeStats();
  console.log(`\nRegime 统计:`);
  console.log(`  当前状态: ${regimeStats.currentRegime}`);
  console.log(`  活跃策略: ${regimeStats.activeStrategies.join(', ')}`);

  return strategy;
}

// ============================================
// 示例 5: 信号聚合模式对比
// ============================================

async function aggregationModesExample() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 5: 信号聚合模式对比');
  console.log('='.repeat(50));

  const modes = ['weighted', 'majority', 'any'];

  for (const mode of modes) {
    console.log(`\n[${mode.toUpperCase()}] 模式:`);

    const strategy = new RegimeSwitchingStrategy({
      symbol: 'BTC/USDT',
      signalAggregation: mode,
      weightedThreshold: 0.5,
    });

    // 模拟子策略信号
    const mockSignals = [
      { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.6 },
      { strategy: 'MACD', signal: { type: 'buy' }, weight: 0.4 },
    ];

    // 测试聚合结果
    let result;
    switch (mode) {
      case 'weighted':
        result = strategy._weightedAggregation(mockSignals);
        break;
      case 'majority':
        result = strategy._majorityAggregation(mockSignals);
        break;
      case 'any':
        result = strategy._anyAggregation(mockSignals);
        break;
    }

    if (result) {
      console.log(`  结果: ${result.type}`);
      console.log(`  权重/数量: ${result.weight || result.count}`);
    } else {
      console.log(`  结果: 无信号`);
    }
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 生成模拟 K 线数据
 */
function generateMockCandles(count, startPrice, type = 'ranging') {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    let change;

    switch (type) {
      case 'trending_up':
        change = 50 + Math.random() * 30 + (Math.random() - 0.5) * 20;
        break;
      case 'trending_down':
        change = -50 - Math.random() * 30 + (Math.random() - 0.5) * 20;
        break;
      case 'high_volatility':
        change = (Math.random() - 0.5) * 500;
        break;
      case 'extreme':
        change = (Math.random() - 0.5) * 2000;
        break;
      case 'ranging':
      default:
        change = Math.sin(i * 0.3) * 100 + (Math.random() - 0.5) * 50;
        break;
    }

    price += change;

    const volatility = type === 'high_volatility' ? 250 : type === 'extreme' ? 1000 : 50;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + volatility,
      low: price - volatility,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 处理 K 线数据
 */
async function processCandles(strategy, candles) {
  for (const candle of candles) {
    // 模拟 onTick 调用
    if (strategy.onTick) {
      await strategy.onTick(candle);
    }
  }
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('Regime Switching 策略示例');
  console.log('='.repeat(50));
  console.log('');

  try {
    // 运行所有示例
    await basicExample();
    await customRegimeMapExample();
    await detectorExample();
    await fullTradingExample();
    await aggregationModesExample();

    console.log('\n' + '='.repeat(50));
    console.log('所有示例运行完成');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('示例运行错误:', error);
    process.exit(1);
  }
}

// 运行
main().catch(console.error);
