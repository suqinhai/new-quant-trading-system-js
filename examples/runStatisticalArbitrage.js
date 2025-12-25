/**
 * 示例：运行统计套利策略
 * Example: Run Statistical Arbitrage Strategy
 *
 * 展示四种统计套利形式：
 * 1. 配对交易 (Pairs Trading)
 * 2. 协整交易 (Cointegration Trading)
 * 3. 跨交易所价差套利 (Cross-Exchange Spread Arbitrage)
 * 4. 永续vs现货基差回归 (Perpetual-Spot Basis Trading)
 */

// 导入回测引擎 / Import backtest engine
import { BacktestEngine } from '../src/backtest/index.js';

// 导入策略 / Import strategy
import {
  StatisticalArbitrageStrategy,
  STAT_ARB_TYPE,
} from '../src/strategies/index.js';

// 导入辅助函数 / Import helper functions
import { formatDate, formatCurrency, formatPercent } from '../src/utils/index.js';

// ============================================
// 生成相关资产的模拟数据
// Generate correlated asset mock data
// ============================================

/**
 * 生成协整的配对资产数据
 * Generate cointegrated pair asset data
 *
 * @param {number} count - 数据数量 / Data count
 * @param {number} correlation - 目标相关性 / Target correlation
 * @param {number} meanReversionSpeed - 均值回归速度 / Mean reversion speed
 * @returns {Object} 两个资产的K线数据 / Candle data for two assets
 */
function generateCointegratedPairData(count = 500, correlation = 0.85, meanReversionSpeed = 0.1) {
  const dataA = [];
  const dataB = [];

  let priceA = 50000;  // BTC 起始价格
  let priceB = 3000;   // ETH 起始价格
  const beta = 16.5;   // 价格比率 (BTC/ETH ≈ 16.5)

  // 价差的均值回归参数
  let spreadDeviation = 0;
  const spreadMean = 0;
  const spreadStd = priceB * 0.02; // 价差标准差

  const startTime = Date.now() - count * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // 生成共同因子 (市场因素)
    const commonFactor = (Math.random() - 0.5) * priceA * 0.01;

    // 生成特异因子
    const idioA = (Math.random() - 0.5) * priceA * 0.005;
    const idioB = (Math.random() - 0.5) * priceB * 0.005;

    // 价差均值回归
    spreadDeviation = spreadDeviation * (1 - meanReversionSpeed) +
                      (Math.random() - 0.5) * spreadStd * 0.5;

    // 更新价格
    const changeA = commonFactor + idioA;
    const changeB = (commonFactor / beta) + idioB + spreadDeviation / beta;

    const openA = priceA;
    const closeA = priceA + changeA;
    const highA = Math.max(openA, closeA) * (1 + Math.random() * 0.005);
    const lowA = Math.min(openA, closeA) * (1 - Math.random() * 0.005);

    const openB = priceB;
    const closeB = priceB + changeB;
    const highB = Math.max(openB, closeB) * (1 + Math.random() * 0.005);
    const lowB = Math.min(openB, closeB) * (1 - Math.random() * 0.005);

    const timestamp = startTime + i * 60 * 60 * 1000;

    dataA.push({
      symbol: 'BTC/USDT',
      timestamp,
      open: openA,
      high: highA,
      low: lowA,
      close: closeA,
      volume: Math.random() * 1000 + 500,
    });

    dataB.push({
      symbol: 'ETH/USDT',
      timestamp,
      open: openB,
      high: highB,
      low: lowB,
      close: closeB,
      volume: Math.random() * 10000 + 5000,
    });

    priceA = closeA;
    priceB = closeB;
  }

  return { dataA, dataB };
}

/**
 * 生成跨交易所价差数据
 * Generate cross-exchange spread data
 */
function generateCrossExchangeData(count = 500) {
  const dataExchangeA = [];
  const dataExchangeB = [];

  let basePrice = 50000;
  const startTime = Date.now() - count * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // 基础价格变动
    const baseChange = (Math.random() - 0.48) * basePrice * 0.015;
    basePrice += baseChange;

    // 交易所A的价格 (领先)
    const priceA = basePrice * (1 + (Math.random() - 0.5) * 0.001);

    // 交易所B的价格 (有时滞后，产生套利机会)
    const lagFactor = Math.sin(i / 20) * 0.002; // 模拟周期性价差
    const priceB = basePrice * (1 + lagFactor + (Math.random() - 0.5) * 0.0005);

    const timestamp = startTime + i * 60 * 60 * 1000;

    dataExchangeA.push({
      symbol: 'BTC/USDT:Binance',
      timestamp,
      open: priceA,
      high: priceA * 1.002,
      low: priceA * 0.998,
      close: priceA,
      volume: Math.random() * 2000 + 1000,
    });

    dataExchangeB.push({
      symbol: 'BTC/USDT:OKX',
      timestamp,
      open: priceB,
      high: priceB * 1.002,
      low: priceB * 0.998,
      close: priceB,
      volume: Math.random() * 1500 + 800,
    });
  }

  return { dataExchangeA, dataExchangeB };
}

/**
 * 生成永续-现货基差数据
 * Generate perpetual-spot basis data
 */
function generatePerpetualSpotData(count = 500) {
  const perpData = [];
  const spotData = [];

  let basePrice = 50000;
  const startTime = Date.now() - count * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // 基础价格变动
    const baseChange = (Math.random() - 0.48) * basePrice * 0.015;
    basePrice += baseChange;

    // 现货价格
    const spotPrice = basePrice;

    // 永续价格 (有基差，基差周期性变化模拟资金费率影响)
    const basisCycle = Math.sin(i / 50) * 0.003; // 模拟基差周期
    const randomBasis = (Math.random() - 0.5) * 0.001;
    const totalBasis = 0.001 + basisCycle + randomBasis; // 平均正基差
    const perpPrice = spotPrice * (1 + totalBasis);

    const timestamp = startTime + i * 60 * 60 * 1000;

    perpData.push({
      symbol: 'BTC/USDT:PERP',
      timestamp,
      open: perpPrice,
      high: perpPrice * 1.002,
      low: perpPrice * 0.998,
      close: perpPrice,
      volume: Math.random() * 3000 + 1500,
    });

    spotData.push({
      symbol: 'BTC/USDT:SPOT',
      timestamp,
      open: spotPrice,
      high: spotPrice * 1.002,
      low: spotPrice * 0.998,
      close: spotPrice,
      volume: Math.random() * 2000 + 1000,
    });
  }

  return { perpData, spotData };
}

// ============================================
// 示例1: 配对交易策略
// Example 1: Pairs Trading Strategy
// ============================================

async function runPairsTrading() {
  console.log('\n');
  console.log('================================================');
  console.log('    示例1: 配对交易策略 / Pairs Trading');
  console.log('================================================\n');

  // 创建策略
  const strategy = new StatisticalArbitrageStrategy({
    name: 'BTC-ETH配对交易',
    arbType: STAT_ARB_TYPE.PAIRS_TRADING,

    // 配对配置
    candidatePairs: [
      { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
    ],

    // 信号参数
    entryZScore: 2.0,      // Z-Score开仓阈值
    exitZScore: 0.5,       // Z-Score平仓阈值
    stopLossZScore: 3.5,   // Z-Score止损阈值

    // 回看周期
    lookbackPeriod: 60,
    cointegrationTestPeriod: 100,

    // 仓位管理
    maxPositionPerPair: 0.2,   // 单配对最大仓位20%
    maxTotalPosition: 0.6,     // 总最大仓位60%

    verbose: true,
  });

  // 创建回测引擎
  const backtest = new BacktestEngine({
    initialCapital: 100000,
    commission: 0.001,
    slippage: 0.0005,
  });

  backtest.setStrategy(strategy);

  // 生成协整配对数据
  console.log('[Pairs] 生成BTC-ETH协整配对数据...');
  const { dataA, dataB } = generateCointegratedPairData(500, 0.85, 0.1);

  // 加载数据
  backtest.loadData('BTC/USDT', dataA);
  backtest.loadData('ETH/USDT', dataB);

  console.log(`[Pairs] 生成 ${dataA.length} 根K线 (BTC) 和 ${dataB.length} 根K线 (ETH)\n`);

  // 运行回测
  console.log('[Pairs] 开始回测...\n');
  const results = await backtest.run();

  // 显示配对交易特有统计
  console.log('配对交易统计 / Pairs Trading Stats:');
  const status = strategy.getStatus();
  console.log(`  总信号数 / Signals: ${status.stats.totalSignals}`);
  console.log(`  胜率 / Win Rate: ${formatPercent(status.winRate)}`);
  console.log(`  活跃配对 / Active Pairs: ${status.pairs.active}`);
  console.log(`  总盈亏 / Total PnL: ${formatCurrency(status.stats.totalPnl)}`);
  console.log('');

  // 显示配对详情
  console.log('配对详情 / Pair Details:');
  const pairsSummary = strategy.getAllPairsSummary();
  for (const pair of pairsSummary) {
    console.log(`  ${pair.id}:`);
    console.log(`    状态 / Status: ${pair.status}`);
    console.log(`    相关性 / Correlation: ${pair.correlation}`);
    console.log(`    半衰期 / Half-Life: ${pair.halfLife} 天`);
    console.log(`    当前Z-Score: ${pair.currentZScore || 'N/A'}`);
  }

  return results;
}

// ============================================
// 示例2: 协整交易策略 (严格版)
// Example 2: Cointegration Trading Strategy
// ============================================

async function runCointegrationTrading() {
  console.log('\n');
  console.log('================================================');
  console.log('  示例2: 协整交易策略 / Cointegration Trading');
  console.log('================================================\n');

  // 创建策略 (更严格的协整参数)
  const strategy = new StatisticalArbitrageStrategy({
    name: '协整套利策略',
    arbType: STAT_ARB_TYPE.COINTEGRATION,

    candidatePairs: [
      { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
    ],

    // 严格的协整检验参数
    adfSignificanceLevel: 0.01,  // 1% 显著性水平
    minCorrelation: 0.8,         // 最小相关性 0.8
    minHalfLife: 2,              // 最小半衰期 2 天
    maxHalfLife: 15,             // 最大半衰期 15 天

    // 保守的信号参数
    entryZScore: 2.5,            // 更高的入场阈值
    exitZScore: 0.3,             // 更低的出场阈值
    stopLossZScore: 4.0,

    // 更长的回看周期
    lookbackPeriod: 80,
    cointegrationTestPeriod: 150,

    verbose: true,
  });

  const backtest = new BacktestEngine({
    initialCapital: 100000,
    commission: 0.001,
    slippage: 0.0005,
  });

  backtest.setStrategy(strategy);

  // 生成更强协整的数据
  console.log('[Cointegration] 生成强协整数据...');
  const { dataA, dataB } = generateCointegratedPairData(600, 0.92, 0.15);

  backtest.loadData('BTC/USDT', dataA);
  backtest.loadData('ETH/USDT', dataB);

  console.log('[Cointegration] 开始回测...\n');
  const results = await backtest.run();

  const status = strategy.getStatus();
  console.log('协整交易统计 / Cointegration Trading Stats:');
  console.log(`  总信号数 / Signals: ${status.stats.totalSignals}`);
  console.log(`  胜率 / Win Rate: ${formatPercent(status.winRate)}`);
  console.log(`  最大回撤 / Max Drawdown: ${formatPercent(Math.abs(status.stats.maxDrawdown / 100000))}`);
  console.log('');

  return results;
}

// ============================================
// 示例3: 跨交易所价差套利
// Example 3: Cross-Exchange Spread Arbitrage
// ============================================

async function runCrossExchangeArbitrage() {
  console.log('\n');
  console.log('================================================');
  console.log('示例3: 跨交易所价差套利 / Cross-Exchange Arbitrage');
  console.log('================================================\n');

  const strategy = new StatisticalArbitrageStrategy({
    name: '跨所价差套利',
    arbType: STAT_ARB_TYPE.CROSS_EXCHANGE,

    candidatePairs: [
      { assetA: 'BTC/USDT:Binance', assetB: 'BTC/USDT:OKX' },
    ],

    // 跨交易所参数
    spreadEntryThreshold: 0.003,   // 0.3% 价差入场
    spreadExitThreshold: 0.001,    // 0.1% 价差出场
    tradingCost: 0.001,            // 0.1% 单边手续费
    slippageEstimate: 0.0005,      // 0.05% 滑点估计

    // 快速回看 (跨所套利需要快速反应)
    lookbackPeriod: 20,

    maxPositionPerPair: 0.3,
    maxHoldingPeriod: 4 * 60 * 60 * 1000,  // 最长持仓4小时

    verbose: true,
  });

  const backtest = new BacktestEngine({
    initialCapital: 100000,
    commission: 0.001,
    slippage: 0.0005,
  });

  backtest.setStrategy(strategy);

  console.log('[CrossExchange] 生成跨交易所数据...');
  const { dataExchangeA, dataExchangeB } = generateCrossExchangeData(500);

  backtest.loadData('BTC/USDT:Binance', dataExchangeA);
  backtest.loadData('BTC/USDT:OKX', dataExchangeB);

  console.log('[CrossExchange] 开始回测...\n');
  const results = await backtest.run();

  const status = strategy.getStatus();
  console.log('跨交易所套利统计 / Cross-Exchange Arb Stats:');
  console.log(`  总交易数 / Total Trades: ${status.stats.totalTrades}`);
  console.log(`  胜率 / Win Rate: ${formatPercent(status.winRate)}`);
  console.log(`  总盈亏 / Total PnL: ${formatCurrency(status.stats.totalPnl)}`);
  console.log('');

  return results;
}

// ============================================
// 示例4: 永续-现货基差套利
// Example 4: Perpetual-Spot Basis Arbitrage
// ============================================

async function runPerpetualSpotBasis() {
  console.log('\n');
  console.log('================================================');
  console.log(' 示例4: 永续-现货基差套利 / Perp-Spot Basis');
  console.log('================================================\n');

  const strategy = new StatisticalArbitrageStrategy({
    name: '期现基差套利',
    arbType: STAT_ARB_TYPE.PERPETUAL_SPOT,

    candidatePairs: [
      { assetA: 'BTC/USDT:PERP', assetB: 'BTC/USDT:SPOT' },
    ],

    // 基差参数
    basisEntryThreshold: 0.10,     // 10% 年化基差入场
    basisExitThreshold: 0.03,      // 3% 年化基差出场
    fundingRateThreshold: 0.001,   // 0.1% 资金费率阈值

    lookbackPeriod: 30,

    maxPositionPerPair: 0.4,       // 期现套利可以用更大仓位
    maxHoldingPeriod: 3 * 24 * 60 * 60 * 1000,  // 最长持仓3天

    verbose: true,
  });

  const backtest = new BacktestEngine({
    initialCapital: 100000,
    commission: 0.0005,  // 较低手续费 (Maker)
    slippage: 0.0002,    // 较低滑点
  });

  backtest.setStrategy(strategy);

  console.log('[PerpSpot] 生成永续-现货数据...');
  const { perpData, spotData } = generatePerpetualSpotData(500);

  backtest.loadData('BTC/USDT:PERP', perpData);
  backtest.loadData('BTC/USDT:SPOT', spotData);

  console.log('[PerpSpot] 开始回测...\n');
  const results = await backtest.run();

  const status = strategy.getStatus();
  console.log('期现基差套利统计 / Perp-Spot Basis Stats:');
  console.log(`  总信号数 / Signals: ${status.stats.totalSignals}`);
  console.log(`  胜率 / Win Rate: ${formatPercent(status.winRate)}`);
  console.log(`  总盈亏 / Total PnL: ${formatCurrency(status.stats.totalPnl)}`);
  console.log('');

  return results;
}

// ============================================
// 主函数
// Main Function
// ============================================

async function main() {
  console.log('================================================');
  console.log('     统计套利策略示例 / Stat Arb Examples');
  console.log('================================================');
  console.log('');
  console.log('统计套利策略特点 / Statistical Arbitrage Features:');
  console.log('  - 非方向性策略 / Market Neutral');
  console.log('  - 收益曲线平滑 / Smooth Equity Curve');
  console.log('  - 与趋势策略低相关 / Low Correlation with Trend');
  console.log('  - 基于均值回归 / Mean Reversion Based');
  console.log('');

  try {
    // 运行所有示例
    const results = {};

    results.pairs = await runPairsTrading();
    results.cointegration = await runCointegrationTrading();
    results.crossExchange = await runCrossExchangeArbitrage();
    results.perpSpot = await runPerpetualSpotBasis();

    // 总结
    console.log('\n');
    console.log('================================================');
    console.log('           策略对比总结 / Strategy Summary');
    console.log('================================================\n');

    console.log('策略类型                | 总收益率    | 胜率      | 夏普比');
    console.log('-'.repeat(70));
    console.log(`配对交易 (Pairs)        | ${formatPercent(results.pairs.returnRate).padEnd(10)} | ${formatPercent(results.pairs.winRate).padEnd(8)} | ${(results.pairs.sharpeRatio || 0).toFixed(2)}`);
    console.log(`协整交易 (Cointegration)| ${formatPercent(results.cointegration.returnRate).padEnd(10)} | ${formatPercent(results.cointegration.winRate).padEnd(8)} | ${(results.cointegration.sharpeRatio || 0).toFixed(2)}`);
    console.log(`跨所套利 (Cross-Ex)     | ${formatPercent(results.crossExchange.returnRate).padEnd(10)} | ${formatPercent(results.crossExchange.winRate).padEnd(8)} | ${(results.crossExchange.sharpeRatio || 0).toFixed(2)}`);
    console.log(`期现基差 (Perp-Spot)    | ${formatPercent(results.perpSpot.returnRate).padEnd(10)} | ${formatPercent(results.perpSpot.winRate).padEnd(8)} | ${(results.perpSpot.sharpeRatio || 0).toFixed(2)}`);
    console.log('-'.repeat(70));

    console.log('\n');
    console.log('组合建议 / Portfolio Recommendations:');
    console.log('  1. 与趋势策略组合，降低组合波动');
    console.log('  2. 配对交易适合高相关资产');
    console.log('  3. 跨所套利需要快速执行能力');
    console.log('  4. 期现基差适合长期持仓');
    console.log('');

    console.log('================================================');
    console.log('         示例运行完成 / Examples Complete');
    console.log('================================================\n');

  } catch (error) {
    console.error('运行错误 / Error:', error.message);
    console.error(error.stack);
  }
}

// 运行主函数
main().catch(console.error);
