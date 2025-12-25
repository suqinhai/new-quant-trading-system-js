/**
 * 自适应参数策略运行示例
 * Adaptive Strategy Runner Example
 *
 * 展示如何运行自适应参数策略，包括：
 * 1. 完全自适应模式
 * 2. 单项自适应模式
 * 3. 参数对比测试
 * 4. 实时监控自适应参数变化
 */

import { BacktestEngine } from '../src/backtest/BacktestEngine.js';
import { AdaptiveStrategy, AdaptiveMode } from '../src/strategies/AdaptiveStrategy.js';
import { SMAStrategy } from '../src/strategies/SMAStrategy.js';
import { MarketDataFetcher } from '../src/marketdata/MarketDataFetcher.js';

// ============================================
// 示例 1: 完全自适应模式
// ============================================
async function runFullAdaptiveStrategy() {
  console.log('═'.repeat(60));
  console.log('示例 1: 完全自适应策略 (Full Adaptive)');
  console.log('═'.repeat(60));

  const strategy = new AdaptiveStrategy({
    name: 'FullAdaptive',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 启用所有自适应功能
    adaptiveMode: AdaptiveMode.FULL,
    enableSMAAdaptive: true,
    enableRSIAdaptive: true,
    enableBBAdaptive: true,

    // SMA 基准参数
    smaBaseFast: 10,
    smaBaseSlow: 30,
    smaPeriodAdjustRange: 0.5,  // ±50% 调整范围

    // RSI 基准参数
    rsiPeriod: 14,
    rsiBaseOversold: 30,
    rsiBaseOverbought: 70,
    // 趋势市阈值
    rsiTrendingOversold: 25,
    rsiTrendingOverbought: 75,
    // 震荡市阈值
    rsiRangingOversold: 35,
    rsiRangingOverbought: 65,

    // 布林带基准参数
    bbPeriod: 20,
    bbBaseStdDev: 2.0,
    bbMinStdDev: 1.5,
    bbMaxStdDev: 3.0,

    // 信号融合权重
    smaWeight: 0.4,
    rsiWeight: 0.3,
    bbWeight: 0.3,
    signalThreshold: 0.5,

    // 趋势过滤
    useTrendFilter: true,
    trendMAPeriod: 50,
  });

  const engine = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });

  engine.setStrategy(strategy);

  // 获取历史数据
  console.log('\n获取历史数据...');
  const fetcher = new MarketDataFetcher();
  const candles = await fetcher.fetchOHLCV('BTC/USDT', '1h', 1000);

  if (!candles || candles.length < 200) {
    console.log('数据不足，跳过示例');
    return;
  }

  console.log(`获取 ${candles.length} 根 K 线数据`);

  // 运行回测
  console.log('\n运行回测...');
  const result = await engine.run(candles);

  // 输出结果
  printResults(result, '完全自适应策略');

  // 输出自适应参数变化统计
  console.log('\n📊 自适应参数统计:');
  const stats = strategy.getStats();
  const adaptiveParams = strategy.getAdaptiveParams();
  console.log(`  当前市场状态: ${stats.currentRegime}`);
  console.log(`  状态切换次数: ${stats.regimeChanges}`);
  console.log(`  当前自适应参数:`);
  console.log(`    - SMA 快线周期: ${adaptiveParams.smaFastPeriod}`);
  console.log(`    - SMA 慢线周期: ${adaptiveParams.smaSlowPeriod}`);
  console.log(`    - RSI 超卖阈值: ${adaptiveParams.rsiOversold}`);
  console.log(`    - RSI 超买阈值: ${adaptiveParams.rsiOverbought}`);
  console.log(`    - BB 标准差倍数: ${adaptiveParams.bbStdDev.toFixed(2)}`);

  return result;
}

// ============================================
// 示例 2: 仅 SMA 自适应 (波动率驱动周期)
// ============================================
async function runSMAAdaptiveOnly() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 2: 仅 SMA 周期自适应 (波动率驱动)');
  console.log('═'.repeat(60));

  const strategy = new AdaptiveStrategy({
    name: 'SMAAdaptive',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 仅启用 SMA 自适应
    adaptiveMode: AdaptiveMode.SMA_ONLY,
    enableSMAAdaptive: true,
    enableRSIAdaptive: false,  // 禁用
    enableBBAdaptive: false,   // 禁用

    // SMA 参数
    smaBaseFast: 10,
    smaBaseSlow: 30,
    smaPeriodAdjustRange: 0.5,
    smaVolLowThreshold: 25,
    smaVolHighThreshold: 75,

    // 固定 RSI 参数
    rsiPeriod: 14,
    rsiBaseOversold: 30,
    rsiBaseOverbought: 70,

    // 固定布林带参数
    bbPeriod: 20,
    bbBaseStdDev: 2.0,

    // 权重偏向 SMA
    smaWeight: 0.6,
    rsiWeight: 0.2,
    bbWeight: 0.2,
  });

  const engine = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });

  engine.setStrategy(strategy);

  const fetcher = new MarketDataFetcher();
  const candles = await fetcher.fetchOHLCV('BTC/USDT', '1h', 1000);

  if (!candles || candles.length < 200) {
    console.log('数据不足，跳过示例');
    return;
  }

  const result = await engine.run(candles);
  printResults(result, 'SMA 自适应策略');

  return result;
}

// ============================================
// 示例 3: 对比固定参数 vs 自适应参数
// ============================================
async function runComparisonTest() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 3: 固定参数 vs 自适应参数对比');
  console.log('═'.repeat(60));

  const fetcher = new MarketDataFetcher();
  const candles = await fetcher.fetchOHLCV('BTC/USDT', '1h', 1000);

  if (!candles || candles.length < 200) {
    console.log('数据不足，跳过示例');
    return;
  }

  console.log(`\n使用 ${candles.length} 根 K 线进行对比测试\n`);

  // 策略 A: 固定参数 SMA 策略
  const fixedStrategy = new SMAStrategy({
    name: 'FixedSMA',
    symbol: 'BTC/USDT',
    shortPeriod: 10,  // 固定周期
    longPeriod: 30,   // 固定周期
    positionPercent: 95,
  });

  // 策略 B: 自适应参数策略
  const adaptiveStrategy = new AdaptiveStrategy({
    name: 'AdaptiveSMA',
    symbol: 'BTC/USDT',
    positionPercent: 95,
    adaptiveMode: AdaptiveMode.FULL,
    smaBaseFast: 10,
    smaBaseSlow: 30,
  });

  // 运行固定参数策略
  const engineA = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });
  engineA.setStrategy(fixedStrategy);
  const resultA = await engineA.run(candles);

  // 运行自适应策略
  const engineB = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });
  engineB.setStrategy(adaptiveStrategy);
  const resultB = await engineB.run(candles);

  // 对比结果
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│                    策略对比结果                         │');
  console.log('├─────────────────────┬──────────────┬──────────────────┤');
  console.log('│ 指标                │ 固定参数 SMA │ 自适应参数策略    │');
  console.log('├─────────────────────┼──────────────┼──────────────────┤');
  console.log(`│ 总收益率            │ ${formatPercent(resultA.totalReturn)} │ ${formatPercent(resultB.totalReturn)} │`);
  console.log(`│ 年化收益率          │ ${formatPercent(resultA.annualizedReturn)} │ ${formatPercent(resultB.annualizedReturn)} │`);
  console.log(`│ 最大回撤            │ ${formatPercent(resultA.maxDrawdown)} │ ${formatPercent(resultB.maxDrawdown)} │`);
  console.log(`│ 夏普比率            │ ${formatNumber(resultA.sharpeRatio)} │ ${formatNumber(resultB.sharpeRatio)} │`);
  console.log(`│ 胜率                │ ${formatPercent(resultA.winRate)} │ ${formatPercent(resultB.winRate)} │`);
  console.log(`│ 盈亏比              │ ${formatNumber(resultA.profitFactor)} │ ${formatNumber(resultB.profitFactor)} │`);
  console.log(`│ 交易次数            │ ${resultA.trades.length.toString().padStart(10)} │ ${resultB.trades.length.toString().padStart(14)} │`);
  console.log('└─────────────────────┴──────────────┴──────────────────┘');

  // 计算提升
  const returnImprovement = ((resultB.totalReturn - resultA.totalReturn) / Math.abs(resultA.totalReturn) * 100) || 0;
  const drawdownImprovement = ((resultA.maxDrawdown - resultB.maxDrawdown) / Math.abs(resultA.maxDrawdown) * 100) || 0;
  const sharpeImprovement = ((resultB.sharpeRatio - resultA.sharpeRatio) / Math.abs(resultA.sharpeRatio || 1) * 100) || 0;

  console.log('\n📈 自适应策略相对提升:');
  console.log(`  收益率提升: ${returnImprovement >= 0 ? '+' : ''}${returnImprovement.toFixed(1)}%`);
  console.log(`  回撤改善: ${drawdownImprovement >= 0 ? '+' : ''}${drawdownImprovement.toFixed(1)}%`);
  console.log(`  夏普比率提升: ${sharpeImprovement >= 0 ? '+' : ''}${sharpeImprovement.toFixed(1)}%`);

  return { fixed: resultA, adaptive: resultB };
}

// ============================================
// 示例 4: 监控自适应参数实时变化
// ============================================
async function runWithParamMonitoring() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 4: 监控自适应参数变化');
  console.log('═'.repeat(60));

  const strategy = new AdaptiveStrategy({
    name: 'MonitoredAdaptive',
    symbol: 'BTC/USDT',
    positionPercent: 95,
    adaptiveMode: AdaptiveMode.FULL,
  });

  const engine = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });

  engine.setStrategy(strategy);

  const fetcher = new MarketDataFetcher();
  const candles = await fetcher.fetchOHLCV('BTC/USDT', '1h', 500);

  if (!candles || candles.length < 200) {
    console.log('数据不足，跳过示例');
    return;
  }

  // 运行回测
  await engine.run(candles);

  // 获取参数变化历史
  const signalHistory = strategy.getSignalHistory(100);

  // 统计参数变化
  const paramChanges = {
    smaFast: { min: Infinity, max: -Infinity, values: [] },
    smaSlow: { min: Infinity, max: -Infinity, values: [] },
    rsiOversold: { values: new Set() },
    rsiOverbought: { values: new Set() },
    bbStdDev: { min: Infinity, max: -Infinity, values: [] },
    regimes: {},
  };

  signalHistory.forEach(s => {
    const params = s.adaptiveParams;

    // SMA 快线周期
    paramChanges.smaFast.min = Math.min(paramChanges.smaFast.min, params.smaFastPeriod);
    paramChanges.smaFast.max = Math.max(paramChanges.smaFast.max, params.smaFastPeriod);
    paramChanges.smaFast.values.push(params.smaFastPeriod);

    // SMA 慢线周期
    paramChanges.smaSlow.min = Math.min(paramChanges.smaSlow.min, params.smaSlowPeriod);
    paramChanges.smaSlow.max = Math.max(paramChanges.smaSlow.max, params.smaSlowPeriod);
    paramChanges.smaSlow.values.push(params.smaSlowPeriod);

    // RSI 阈值
    paramChanges.rsiOversold.values.add(params.rsiOversold);
    paramChanges.rsiOverbought.values.add(params.rsiOverbought);

    // BB 标准差
    paramChanges.bbStdDev.min = Math.min(paramChanges.bbStdDev.min, params.bbStdDev);
    paramChanges.bbStdDev.max = Math.max(paramChanges.bbStdDev.max, params.bbStdDev);
    paramChanges.bbStdDev.values.push(params.bbStdDev);

    // 市场状态统计
    paramChanges.regimes[s.regime] = (paramChanges.regimes[s.regime] || 0) + 1;
  });

  console.log('\n📊 自适应参数变化统计:');
  console.log('─'.repeat(50));

  console.log('\n🔄 SMA 快线周期变化:');
  console.log(`   范围: ${paramChanges.smaFast.min} ~ ${paramChanges.smaFast.max}`);
  console.log(`   平均: ${(paramChanges.smaFast.values.reduce((a, b) => a + b, 0) / paramChanges.smaFast.values.length).toFixed(1)}`);

  console.log('\n🔄 SMA 慢线周期变化:');
  console.log(`   范围: ${paramChanges.smaSlow.min} ~ ${paramChanges.smaSlow.max}`);
  console.log(`   平均: ${(paramChanges.smaSlow.values.reduce((a, b) => a + b, 0) / paramChanges.smaSlow.values.length).toFixed(1)}`);

  console.log('\n🔄 RSI 阈值变化:');
  console.log(`   超卖阈值: ${[...paramChanges.rsiOversold.values].sort((a, b) => a - b).join(', ')}`);
  console.log(`   超买阈值: ${[...paramChanges.rsiOverbought.values].sort((a, b) => a - b).join(', ')}`);

  console.log('\n🔄 布林带标准差变化:');
  console.log(`   范围: ${paramChanges.bbStdDev.min.toFixed(2)} ~ ${paramChanges.bbStdDev.max.toFixed(2)}`);
  console.log(`   平均: ${(paramChanges.bbStdDev.values.reduce((a, b) => a + b, 0) / paramChanges.bbStdDev.values.length).toFixed(2)}`);

  console.log('\n📈 市场状态分布:');
  const totalRegimes = Object.values(paramChanges.regimes).reduce((a, b) => a + b, 0);
  Object.entries(paramChanges.regimes).forEach(([regime, count]) => {
    const percent = (count / totalRegimes * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(percent / 5));
    console.log(`   ${regime.padEnd(15)}: ${bar} ${percent}%`);
  });
}

// ============================================
// 示例 5: 不同市场环境下的参数演示
// ============================================
async function demonstrateParamAdaptation() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 5: 参数自适应原理演示');
  console.log('═'.repeat(60));

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     自适应参数原理                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📌 SMA 周期自适应 (波动率驱动)                               ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ 高波动 (Vol > 75%) → 短周期 (快线 5-8, 慢线 15-25)     │ ║
║  │   原因: 快速响应价格变化，及时捕捉趋势反转             │ ║
║  │                                                        │ ║
║  │ 低波动 (Vol < 25%) → 长周期 (快线 12-15, 慢线 35-45)   │ ║
║  │   原因: 过滤噪音，避免频繁交易                         │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  📌 RSI 阈值自适应 (市场状态驱动)                             ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ 趋势市 (ADX > 25) → 宽阈值 (超卖 25, 超买 75)          │ ║
║  │   原因: 让趋势充分发展，避免过早离场                   │ ║
║  │                                                        │ ║
║  │ 震荡市 (ADX < 25) → 窄阈值 (超卖 35, 超买 65)          │ ║
║  │   原因: 更早捕捉反转，利用区间波动                     │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  📌 布林带宽度自适应 (ATR 驱动)                               ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ ATR 高位 (> 75%) → 大标准差 (2.5-3.0)                  │ ║
║  │   原因: 扩大通道宽度，减少假突破信号                   │ ║
║  │                                                        │ ║
║  │ ATR 低位 (< 25%) → 小标准差 (1.5-2.0)                  │ ║
║  │   原因: 收窄通道宽度，更敏感地捕捉价格异常             │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  🎯 核心思想: 参数是策略的一部分，不是固定常数               ║
║     → 市场有状态，参数应适应状态                             ║
║     → 这是专业量化 vs 普通量化的分水岭                       ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 模拟不同市场状态下的参数
  const scenarios = [
    {
      name: '低波动震荡市',
      volatilityIndex: 20,
      regime: 'ranging',
      expectedParams: {
        smaFast: '12-15',
        smaSlow: '36-45',
        rsiThresholds: '35/65',
        bbStdDev: '1.6-1.8',
      },
    },
    {
      name: '正常趋势市',
      volatilityIndex: 50,
      regime: 'trending_up',
      expectedParams: {
        smaFast: '8-12',
        smaSlow: '24-36',
        rsiThresholds: '25/75',
        bbStdDev: '1.8-2.2',
      },
    },
    {
      name: '高波动趋势市',
      volatilityIndex: 85,
      regime: 'trending_down',
      expectedParams: {
        smaFast: '5-8',
        smaSlow: '15-24',
        rsiThresholds: '25/75',
        bbStdDev: '2.5-3.0',
      },
    },
  ];

  console.log('\n模拟不同市场状态下的参数调整:\n');

  scenarios.forEach(s => {
    console.log(`📊 ${s.name} (波动率指数: ${s.volatilityIndex}%, 状态: ${s.regime})`);
    console.log(`   SMA 快线周期: ${s.expectedParams.smaFast}`);
    console.log(`   SMA 慢线周期: ${s.expectedParams.smaSlow}`);
    console.log(`   RSI 阈值: ${s.expectedParams.rsiThresholds}`);
    console.log(`   BB 标准差: ${s.expectedParams.bbStdDev}`);
    console.log('');
  });
}

// ============================================
// 辅助函数
// ============================================
function printResults(result, strategyName) {
  console.log(`\n📊 ${strategyName} 回测结果:`);
  console.log('─'.repeat(50));
  console.log(`  初始资金: $${result.initialCapital.toLocaleString()}`);
  console.log(`  最终资金: $${result.finalCapital.toLocaleString()}`);
  console.log(`  总收益率: ${(result.totalReturn * 100).toFixed(2)}%`);
  console.log(`  年化收益率: ${(result.annualizedReturn * 100).toFixed(2)}%`);
  console.log(`  最大回撤: ${(result.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  夏普比率: ${result.sharpeRatio.toFixed(2)}`);
  console.log(`  胜率: ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  盈亏比: ${result.profitFactor.toFixed(2)}`);
  console.log(`  交易次数: ${result.trades.length}`);
}

function formatPercent(value) {
  const percent = (value * 100).toFixed(2);
  return (percent + '%').padStart(12);
}

function formatNumber(value) {
  return value.toFixed(2).padStart(12);
}

// ============================================
// 主程序
// ============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           自适应参数策略 (Adaptive Strategy)               ║');
  console.log('║                                                            ║');
  console.log('║   核心理念: 策略不变，参数随市场状态动态调整               ║');
  console.log('║   这是专业量化 vs 普通量化的分水岭                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 演示参数自适应原理
    await demonstrateParamAdaptation();

    // 运行完全自适应策略
    await runFullAdaptiveStrategy();

    // 运行仅 SMA 自适应
    await runSMAAdaptiveOnly();

    // 对比固定参数 vs 自适应参数
    await runComparisonTest();

    // 监控参数变化
    await runWithParamMonitoring();

    console.log('\n' + '═'.repeat(60));
    console.log('所有示例运行完成!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('运行出错:', error.message);
    console.error(error.stack);
  }
}

// 运行主程序
main();
