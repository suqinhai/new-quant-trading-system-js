/**
 * 风控驱动策略运行示例
 * Risk-Driven Strategy Runner Example
 *
 * 展示如何运行风控驱动策略，包括：
 * 1. 目标波动率模式
 * 2. 最大回撤控制模式
 * 3. 波动率突破模式
 * 4. 组合模式（推荐）
 * 5. 风控事件监控
 */

import { BacktestEngine } from '../src/backtest/BacktestEngine.js';
import { RiskDrivenStrategy, RiskMode, RiskLevel, RiskEvent } from '../src/strategies/RiskDrivenStrategy.js';
import { SMAStrategy } from '../src/strategies/SMAStrategy.js';
import { MarketDataFetcher } from '../src/marketdata/MarketDataFetcher.js';

// ============================================
// 示例 1: 目标波动率模式
// ============================================
async function runTargetVolatilityMode() {
  console.log('═'.repeat(60));
  console.log('示例 1: 目标波动率模式 (Target Volatility)');
  console.log('═'.repeat(60));

  const strategy = new RiskDrivenStrategy({
    name: 'TargetVolStrategy',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 启用目标波动率模式
    riskMode: RiskMode.TARGET_VOLATILITY,

    // 目标波动率参数
    targetVolatility: 0.15,           // 目标年化波动率 15%
    volatilityLookback: 20,           // 波动率计算周期
    volatilityAdjustSpeed: 0.3,       // 调整速度 (0-1)
    minPositionRatio: 0.1,            // 最小仓位 10%
    maxPositionRatio: 1.5,            // 最大仓位 150%
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
  printResults(result, '目标波动率策略');

  // 输出风控统计
  console.log('\n📊 风控统计:');
  const stats = strategy.getStats();
  console.log(`  当前风险等级: ${stats.riskLevel}`);
  console.log(`  当前仓位比例: ${(stats.positionRatio * 100).toFixed(1)}%`);
  console.log(`  总风控事件: ${stats.totalEvents}`);
  console.log(`  当前波动率: ${stats.volatility ? (stats.volatility * 100).toFixed(1) + '%' : 'N/A'}`);

  return result;
}

// ============================================
// 示例 2: 最大回撤控制模式
// ============================================
async function runMaxDrawdownMode() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 2: 最大回撤控制模式 (Max Drawdown Control)');
  console.log('═'.repeat(60));

  const strategy = new RiskDrivenStrategy({
    name: 'DrawdownControl',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 启用最大回撤控制模式
    riskMode: RiskMode.MAX_DRAWDOWN,

    // 回撤阈值参数
    maxDrawdown: 0.15,                // 最大回撤阈值 15%
    warningDrawdown: 0.10,            // 预警阈值 10%
    criticalDrawdown: 0.20,           // 严重阈值 20%
    emergencyDrawdown: 0.25,          // 紧急阈值 25%
    drawdownReduceSpeed: 0.5,         // 减仓速度
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
  printResults(result, '最大回撤控制策略');

  // 输出回撤统计
  const drawdownStats = strategy.drawdownMonitor.getStats();
  console.log('\n📊 回撤统计:');
  console.log(`  当前回撤: ${(drawdownStats.currentDrawdown * 100).toFixed(2)}%`);
  console.log(`  历史最大回撤: ${(drawdownStats.maxHistoricalDrawdown * 100).toFixed(2)}%`);
  console.log(`  恢复进度: ${drawdownStats.recoveryProgress.toFixed(1)}%`);
  console.log(`  风险等级: ${drawdownStats.riskLevel}`);

  return result;
}

// ============================================
// 示例 3: 波动率突破模式
// ============================================
async function runVolatilityBreakoutMode() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 3: 波动率突破模式 (Volatility Breakout)');
  console.log('═'.repeat(60));

  const strategy = new RiskDrivenStrategy({
    name: 'VolBreakout',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 启用波动率突破模式
    riskMode: RiskMode.VOLATILITY_BREAKOUT,

    // 波动率突破参数
    volatilityBreakoutThreshold: 2.0, // 2倍突破触发
    volatilityBreakoutLookback: 60,   // 60周期历史参考
    forceReduceRatio: 0.5,            // 突破时减仓50%
    volatilityLookback: 20,           // 当前波动率计算周期
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
  printResults(result, '波动率突破策略');

  // 输出波动率统计
  const volBreakout = strategy.volatilityCalculator.detectBreakout(2.0);
  console.log('\n📊 波动率统计:');
  console.log(`  当前波动率: ${volBreakout.current ? (volBreakout.current * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  历史平均: ${volBreakout.historical ? (volBreakout.historical * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  波动率比率: ${volBreakout.ratio ? volBreakout.ratio.toFixed(2) + 'x' : 'N/A'}`);
  console.log(`  是否突破: ${volBreakout.isBreakout ? '是' : '否'}`);
  console.log(`  波动率百分位: ${strategy.volatilityCalculator.getPercentile().toFixed(1)}%`);

  return result;
}

// ============================================
// 示例 4: 组合模式（推荐）
// ============================================
async function runCombinedMode() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 4: 组合模式 (Combined - 推荐)');
  console.log('═'.repeat(60));

  const strategy = new RiskDrivenStrategy({
    name: 'CombinedRisk',
    symbol: 'BTC/USDT',
    positionPercent: 95,

    // 启用组合模式 - 同时使用所有风控机制
    riskMode: RiskMode.COMBINED,

    // 目标波动率
    targetVolatility: 0.15,
    volatilityAdjustSpeed: 0.3,

    // 最大回撤
    maxDrawdown: 0.15,
    warningDrawdown: 0.10,
    criticalDrawdown: 0.20,
    emergencyDrawdown: 0.25,

    // 波动率突破
    volatilityBreakoutThreshold: 2.0,
    forceReduceRatio: 0.5,

    // 通用参数
    volatilityLookback: 20,
    minPositionRatio: 0.1,
    maxPositionRatio: 1.0,
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
  printResults(result, '组合风控策略');

  // 输出综合风控状态
  const riskStatus = strategy.getRiskStatus();
  console.log('\n📊 综合风控状态:');
  console.log(`  风险等级: ${riskStatus.level}`);
  console.log(`  仓位比例: ${(riskStatus.positionRatio * 100).toFixed(1)}%`);
  console.log(`  低风险模式: ${riskStatus.isLowRiskMode ? '是' : '否'}`);
  console.log(`  当前回撤: ${(riskStatus.drawdown.currentDrawdown * 100).toFixed(2)}%`);
  console.log(`  当前波动率: ${riskStatus.volatility.current ? (riskStatus.volatility.current * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  波动率百分位: ${riskStatus.volatility.percentile.toFixed(1)}%`);

  return result;
}

// ============================================
// 示例 5: 对比传统策略 vs 风控驱动策略
// ============================================
async function runComparisonTest() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 5: 传统策略 vs 风控驱动策略对比');
  console.log('═'.repeat(60));

  const fetcher = new MarketDataFetcher();
  const candles = await fetcher.fetchOHLCV('BTC/USDT', '1h', 1000);

  if (!candles || candles.length < 200) {
    console.log('数据不足，跳过示例');
    return;
  }

  console.log(`\n使用 ${candles.length} 根 K 线进行对比测试\n`);

  // 策略 A: 传统 SMA 策略（无风控）
  const traditionalStrategy = new SMAStrategy({
    name: 'TraditionalSMA',
    symbol: 'BTC/USDT',
    shortPeriod: 10,
    longPeriod: 30,
    positionPercent: 95,
  });

  // 策略 B: 风控驱动策略
  const riskDrivenStrategy = new RiskDrivenStrategy({
    name: 'RiskDrivenCombined',
    symbol: 'BTC/USDT',
    positionPercent: 95,
    riskMode: RiskMode.COMBINED,
    targetVolatility: 0.15,
    maxDrawdown: 0.15,
    volatilityBreakoutThreshold: 2.0,
  });

  // 运行传统策略
  const engineA = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });
  engineA.setStrategy(traditionalStrategy);
  const resultA = await engineA.run(candles);

  // 运行风控驱动策略
  const engineB = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  });
  engineB.setStrategy(riskDrivenStrategy);
  const resultB = await engineB.run(candles);

  // 对比结果
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│                    策略对比结果                         │');
  console.log('├─────────────────────┬──────────────┬──────────────────┤');
  console.log('│ 指标                │ 传统 SMA     │ 风控驱动策略      │');
  console.log('├─────────────────────┼──────────────┼──────────────────┤');
  console.log(`│ 总收益率            │ ${formatPercent(resultA.totalReturn)} │ ${formatPercent(resultB.totalReturn)} │`);
  console.log(`│ 年化收益率          │ ${formatPercent(resultA.annualizedReturn)} │ ${formatPercent(resultB.annualizedReturn)} │`);
  console.log(`│ 最大回撤            │ ${formatPercent(resultA.maxDrawdown)} │ ${formatPercent(resultB.maxDrawdown)} │`);
  console.log(`│ 夏普比率            │ ${formatNumber(resultA.sharpeRatio)} │ ${formatNumber(resultB.sharpeRatio)} │`);
  console.log(`│ 胜率                │ ${formatPercent(resultA.winRate)} │ ${formatPercent(resultB.winRate)} │`);
  console.log(`│ 盈亏比              │ ${formatNumber(resultA.profitFactor)} │ ${formatNumber(resultB.profitFactor)} │`);
  console.log(`│ 交易次数            │ ${resultA.trades.length.toString().padStart(10)} │ ${resultB.trades.length.toString().padStart(14)} │`);
  console.log('└─────────────────────┴──────────────┴──────────────────┘');

  // 计算风险调整后的指标改善
  const drawdownImprovement = resultA.maxDrawdown > 0
    ? ((resultA.maxDrawdown - resultB.maxDrawdown) / resultA.maxDrawdown * 100)
    : 0;
  const sharpeImprovement = resultA.sharpeRatio !== 0
    ? ((resultB.sharpeRatio - resultA.sharpeRatio) / Math.abs(resultA.sharpeRatio) * 100)
    : 0;

  console.log('\n📈 风控驱动策略相对改善:');
  console.log(`  回撤改善: ${drawdownImprovement >= 0 ? '+' : ''}${drawdownImprovement.toFixed(1)}%`);
  console.log(`  夏普比率提升: ${sharpeImprovement >= 0 ? '+' : ''}${sharpeImprovement.toFixed(1)}%`);
  console.log(`  风控事件总数: ${riskDrivenStrategy.getEventHistory().length}`);

  return { traditional: resultA, riskDriven: resultB };
}

// ============================================
// 示例 6: 风控事件监控
// ============================================
async function runWithEventMonitoring() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 6: 风控事件监控');
  console.log('═'.repeat(60));

  const strategy = new RiskDrivenStrategy({
    name: 'EventMonitor',
    symbol: 'BTC/USDT',
    positionPercent: 95,
    riskMode: RiskMode.COMBINED,
    targetVolatility: 0.15,
    maxDrawdown: 0.12,
    warningDrawdown: 0.08,
  });

  // 监听风控事件
  const eventLog = [];
  strategy.on('riskEvent', (event) => {
    eventLog.push(event);
    console.log(`  [${new Date(event.timestamp).toISOString()}] ${event.type}`);
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

  console.log('\n实时风控事件:');
  await engine.run(candles);

  // 统计事件类型
  const eventCounts = {};
  eventLog.forEach(e => {
    eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
  });

  console.log('\n📊 风控事件统计:');
  console.log('─'.repeat(50));
  Object.entries(eventCounts).forEach(([type, count]) => {
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`  ${type.padEnd(25)}: ${bar} (${count})`);
  });

  // 获取最近的事件历史
  const recentEvents = strategy.getEventHistory(10);
  if (recentEvents.length > 0) {
    console.log('\n📋 最近 10 个风控事件:');
    recentEvents.forEach((e, i) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      console.log(`  ${i + 1}. [${time}] ${e.type} ${e.reason ? `- ${e.reason}` : ''}`);
    });
  }
}

// ============================================
// 示例 7: 不同风险偏好配置
// ============================================
async function demonstrateRiskProfiles() {
  console.log('\n' + '═'.repeat(60));
  console.log('示例 7: 不同风险偏好配置演示');
  console.log('═'.repeat(60));

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     风险偏好配置指南                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📌 保守型 (Conservative)                                    ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ targetVolatility: 0.10      // 10% 目标波动率          │ ║
║  │ maxDrawdown: 0.10           // 10% 最大回撤            │ ║
║  │ warningDrawdown: 0.06       // 6% 预警                 │ ║
║  │ volatilityBreakoutThreshold: 1.5  // 1.5x 波动率突破   │ ║
║  │ forceReduceRatio: 0.6       // 突破时减仓 60%          │ ║
║  │                                                        │ ║
║  │ 适合: 资金安全第一，能接受较低收益                      │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  📌 平衡型 (Balanced) - 推荐                                 ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ targetVolatility: 0.15      // 15% 目标波动率          │ ║
║  │ maxDrawdown: 0.15           // 15% 最大回撤            │ ║
║  │ warningDrawdown: 0.10       // 10% 预警                │ ║
║  │ volatilityBreakoutThreshold: 2.0  // 2x 波动率突破     │ ║
║  │ forceReduceRatio: 0.5       // 突破时减仓 50%          │ ║
║  │                                                        │ ║
║  │ 适合: 追求风险与收益的平衡                              │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  📌 激进型 (Aggressive)                                      ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │ targetVolatility: 0.25      // 25% 目标波动率          │ ║
║  │ maxDrawdown: 0.20           // 20% 最大回撤            │ ║
║  │ warningDrawdown: 0.15       // 15% 预警                │ ║
║  │ volatilityBreakoutThreshold: 2.5  // 2.5x 波动率突破   │ ║
║  │ forceReduceRatio: 0.4       // 突破时减仓 40%          │ ║
║  │                                                        │ ║
║  │ 适合: 能承受较大波动，追求更高收益                      │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║  🎯 核心原则:                                                ║
║     生存 > 盈利                                              ║
║     风险可预测，收益不可预测                                 ║
║     控制风险就是控制命运                                     ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 创建三种风险配置的策略实例
  const profiles = [
    {
      name: '保守型',
      config: {
        targetVolatility: 0.10,
        maxDrawdown: 0.10,
        warningDrawdown: 0.06,
        volatilityBreakoutThreshold: 1.5,
        forceReduceRatio: 0.6,
      },
    },
    {
      name: '平衡型',
      config: {
        targetVolatility: 0.15,
        maxDrawdown: 0.15,
        warningDrawdown: 0.10,
        volatilityBreakoutThreshold: 2.0,
        forceReduceRatio: 0.5,
      },
    },
    {
      name: '激进型',
      config: {
        targetVolatility: 0.25,
        maxDrawdown: 0.20,
        warningDrawdown: 0.15,
        volatilityBreakoutThreshold: 2.5,
        forceReduceRatio: 0.4,
      },
    },
  ];

  console.log('风险配置预览:');
  profiles.forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.name}:`);
    console.log(`   目标波动率: ${(p.config.targetVolatility * 100).toFixed(0)}%`);
    console.log(`   最大回撤: ${(p.config.maxDrawdown * 100).toFixed(0)}%`);
    console.log(`   波动率突破倍数: ${p.config.volatilityBreakoutThreshold}x`);
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
  console.log('║           风控驱动策略 (Risk-Driven Strategy)              ║');
  console.log('║                                                            ║');
  console.log('║   核心理念: 用风控当交易信号，而不是止损                    ║');
  console.log('║   设计哲学: 生存优先，盈利其次                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 演示不同风险配置
    await demonstrateRiskProfiles();

    // 运行目标波动率模式
    await runTargetVolatilityMode();

    // 运行最大回撤控制模式
    await runMaxDrawdownMode();

    // 运行波动率突破模式
    await runVolatilityBreakoutMode();

    // 运行组合模式
    await runCombinedMode();

    // 对比传统策略 vs 风控驱动策略
    await runComparisonTest();

    // 监控风控事件
    await runWithEventMonitoring();

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
