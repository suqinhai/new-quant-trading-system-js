/**
 * 执行 Alpha 示例
 * Execution Alpha Example
 *
 * 演示如何使用执行 Alpha 模块优化订单执行
 * Demonstrates how to use Execution Alpha module for order execution optimization
 */

import {
  // 核心引擎
  ExecutionAlphaEngine,
  EXECUTION_STRATEGY,
  ORDER_SIZE_CLASS,

  // 盘口分析器
  OrderBookAnalyzer,
  LIQUIDITY_LEVEL,
  PRESSURE_DIRECTION,

  // TWAP/VWAP 执行器
  TWAPVWAPExecutor,
  ALGO_TYPE,
  MARKET_CONDITION,
  VOLUME_CURVES,

  // 冰山单执行器
  IcebergOrderExecutor,
  SPLIT_STRATEGY,
  DISPLAY_MODE,

  // 滑点分析器
  SlippageAnalyzer,
  SLIPPAGE_RISK,
  PERIOD_TYPE,

  // 便捷函数
  createExecutionAlphaEngine,
  quickAnalyze,
} from '../src/executor/executionAlpha/index.js';

// ============================================
// 模拟数据生成器 / Mock Data Generator
// ============================================

/**
 * 生成模拟盘口数据
 * Generate mock order book data
 */
function generateMockOrderBook(midPrice = 50000, depth = 20) {
  const bids = [];
  const asks = [];

  for (let i = 0; i < depth; i++) {
    // 买盘：价格递减，数量随机
    bids.push([
      midPrice * (1 - 0.0001 * (i + 1)),  // 价格
      0.5 + Math.random() * 2,             // 数量
    ]);

    // 卖盘：价格递增，数量随机
    asks.push([
      midPrice * (1 + 0.0001 * (i + 1)),  // 价格
      0.5 + Math.random() * 2,             // 数量
    ]);
  }

  return {
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
    bids,
    asks,
    nonce: Date.now(),
  };
}

/**
 * 生成模拟历史成交数据
 * Generate mock trade history
 */
function generateMockTrades(count = 100, basePrice = 50000) {
  const trades = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    currentPrice += (Math.random() - 0.5) * 100;
    trades.push({
      timestamp: Date.now() - (count - i) * 60000,
      price: currentPrice,
      amount: 0.1 + Math.random() * 2,
      side: Math.random() > 0.5 ? 'buy' : 'sell',
    });
  }

  return trades;
}

/**
 * 生成模拟 K 线数据
 * Generate mock candles
 */
function generateMockCandles(count = 24, basePrice = 50000) {
  const candles = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    const open = currentPrice;
    const change = (Math.random() - 0.5) * 1000;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 200;
    const low = Math.min(open, close) - Math.random() * 200;
    const volume = 100 + Math.random() * 500;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

// ============================================
// 示例 1: 盘口深度分析
// Example 1: Order Book Depth Analysis
// ============================================

async function orderBookAnalysisExample() {
  console.log('\n=== 示例 1: 盘口深度分析 ===\n');

  // 创建盘口分析器
  const analyzer = new OrderBookAnalyzer({
    depthLevels: 20,
    imbalanceThreshold: 0.3,
  });

  // 生成模拟盘口
  const orderBook = generateMockOrderBook(50000, 20);

  // 分析盘口深度
  const depthAnalysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

  console.log('盘口深度分析结果:');
  console.log(`  买盘总量: ${depthAnalysis.bidDepth.toFixed(4)} BTC`);
  console.log(`  卖盘总量: ${depthAnalysis.askDepth.toFixed(4)} BTC`);
  console.log(`  买卖比: ${depthAnalysis.bidAskRatio.toFixed(4)}`);
  console.log(`  价差: ${(depthAnalysis.spread * 100).toFixed(4)}%`);
  console.log(`  中间价: $${depthAnalysis.midPrice.toFixed(2)}`);
  console.log(`  不平衡度: ${depthAnalysis.imbalance.toFixed(4)}`);
  console.log(`  压力方向: ${depthAnalysis.pressure}`);

  // 评估流动性
  const liquidityAssessment = analyzer.assessLiquidity('BTC/USDT', 1.0, depthAnalysis);

  console.log('\n流动性评估:');
  console.log(`  流动性等级: ${liquidityAssessment.level}`);
  console.log(`  可执行比例: ${(liquidityAssessment.fillableRatio * 100).toFixed(2)}%`);
  console.log(`  建议拆分: ${liquidityAssessment.suggestSplit ? '是' : '否'}`);
  console.log(`  建议份数: ${liquidityAssessment.suggestedSplits}`);

  // 估算冲击成本
  const impactCost = analyzer.estimateImpactCost('BTC/USDT', 'buy', 2.0, orderBook);

  console.log('\n冲击成本估算 (买入 2 BTC):');
  console.log(`  预估滑点: ${(impactCost.estimatedSlippage * 100).toFixed(4)}%`);
  console.log(`  冲击等级: ${impactCost.impactLevel}`);
  console.log(`  预估成交均价: $${impactCost.estimatedFillPrice.toFixed(2)}`);
}

// ============================================
// 示例 2: 滑点风险分析
// Example 2: Slippage Risk Analysis
// ============================================

async function slippageAnalysisExample() {
  console.log('\n=== 示例 2: 滑点风险分析 ===\n');

  // 创建滑点分析器
  const analyzer = new SlippageAnalyzer({
    lookbackPeriod: 100,
    warningThreshold: 0.005,
    criticalThreshold: 0.01,
  });

  // 生成模拟交易历史
  const trades = generateMockTrades(100, 50000);

  // 分析当前时段风险
  const periodRisk = analyzer.analyzePeriodRisk('BTC/USDT');

  console.log('时段风险分析:');
  console.log(`  当前时段类型: ${periodRisk.periodType}`);
  console.log(`  风险等级: ${periodRisk.riskLevel}`);
  console.log(`  风险得分: ${periodRisk.riskScore.toFixed(2)}`);
  console.log(`  建议延迟: ${periodRisk.suggestDelay ? '是' : '否'}`);

  // 记录一些历史滑点数据
  for (let i = 0; i < 20; i++) {
    analyzer.recordSlippage('BTC/USDT', {
      expectedPrice: 50000,
      actualPrice: 50000 * (1 + (Math.random() - 0.5) * 0.01),
      size: 0.5 + Math.random(),
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      timestamp: Date.now() - i * 3600000,
    });
  }

  // 获取滑点统计
  const stats = analyzer.getSlippageStats('BTC/USDT');

  console.log('\n滑点历史统计:');
  console.log(`  样本数: ${stats.count}`);
  console.log(`  平均滑点: ${(stats.averageSlippage * 100).toFixed(4)}%`);
  console.log(`  最大滑点: ${(stats.maxSlippage * 100).toFixed(4)}%`);
  console.log(`  标准差: ${(stats.stdDev * 100).toFixed(4)}%`);

  // 预测滑点
  const prediction = analyzer.predictSlippage('BTC/USDT', 'buy', 1.5);

  console.log('\n滑点预测 (买入 1.5 BTC):');
  console.log(`  预期滑点: ${(prediction.expectedSlippage * 100).toFixed(4)}%`);
  console.log(`  置信区间: [${(prediction.confidenceInterval[0] * 100).toFixed(4)}%, ${(prediction.confidenceInterval[1] * 100).toFixed(4)}%]`);
  console.log(`  风险等级: ${prediction.riskLevel}`);
}

// ============================================
// 示例 3: TWAP/VWAP 执行
// Example 3: TWAP/VWAP Execution
// ============================================

async function twapVwapExample() {
  console.log('\n=== 示例 3: TWAP/VWAP 执行 ===\n');

  // 创建 TWAP/VWAP 执行器
  const executor = new TWAPVWAPExecutor({
    defaultAlgo: ALGO_TYPE.ADAPTIVE,
    minSliceInterval: 5000,
    maxSliceInterval: 60000,
  });

  // 生成模拟 K 线（用于 VWAP 计算）
  const candles = generateMockCandles(24, 50000);

  // 创建 TWAP 执行计划
  const twapPlan = executor.createExecutionPlan({
    symbol: 'BTC/USDT',
    side: 'buy',
    totalSize: 5.0,
    algo: ALGO_TYPE.TWAP,
    duration: 30 * 60 * 1000,  // 30 分钟
    sliceCount: 10,
    randomize: true,
    randomRange: 0.2,
  });

  console.log('TWAP 执行计划:');
  console.log(`  算法: ${twapPlan.algo}`);
  console.log(`  总数量: ${twapPlan.totalSize} BTC`);
  console.log(`  切片数: ${twapPlan.slices.length}`);
  console.log(`  总时长: ${twapPlan.duration / 60000} 分钟`);

  console.log('\n  切片详情 (前5个):');
  twapPlan.slices.slice(0, 5).forEach((slice, i) => {
    console.log(`    第 ${i + 1} 片: ${slice.size.toFixed(4)} BTC @ ${new Date(slice.scheduledTime).toLocaleTimeString()}`);
  });

  // 创建 VWAP 执行计划
  const vwapPlan = executor.createExecutionPlan({
    symbol: 'BTC/USDT',
    side: 'buy',
    totalSize: 5.0,
    algo: ALGO_TYPE.VWAP,
    duration: 60 * 60 * 1000,  // 1 小时
    sliceCount: 12,
    volumeCurve: VOLUME_CURVES.U_SHAPED,
    historicalVolume: candles.map(c => c.volume),
  });

  console.log('\nVWAP 执行计划 (U型曲线):');
  console.log(`  算法: ${vwapPlan.algo}`);
  console.log(`  切片数: ${vwapPlan.slices.length}`);

  console.log('\n  成交量分布:');
  vwapPlan.slices.forEach((slice, i) => {
    const bar = '█'.repeat(Math.round(slice.size / twapPlan.totalSize * 50));
    console.log(`    ${String(i + 1).padStart(2)}: ${bar} ${slice.size.toFixed(4)}`);
  });
}

// ============================================
// 示例 4: 冰山单执行
// Example 4: Iceberg Order Execution
// ============================================

async function icebergExample() {
  console.log('\n=== 示例 4: 冰山单执行 ===\n');

  // 创建冰山单执行器
  const executor = new IcebergOrderExecutor({
    defaultSplitStrategy: SPLIT_STRATEGY.ADAPTIVE,
    defaultDisplayMode: DISPLAY_MODE.DYNAMIC,
    minSplitCount: 5,
    maxSplitCount: 50,
  });

  // 生成模拟盘口
  const orderBook = generateMockOrderBook(50000, 20);

  // 创建冰山单计划
  const icebergPlan = executor.createIcebergPlan({
    symbol: 'BTC/USDT',
    side: 'buy',
    totalSize: 10.0,
    splitStrategy: SPLIT_STRATEGY.ADAPTIVE,
    displayMode: DISPLAY_MODE.DYNAMIC,
    orderBook,
    avgDailyVolume: 1000,  // 假设日均交易量
  });

  console.log('冰山单执行计划:');
  console.log(`  总数量: ${icebergPlan.totalSize} BTC`);
  console.log(`  拆分策略: ${icebergPlan.splitStrategy}`);
  console.log(`  显示模式: ${icebergPlan.displayMode}`);
  console.log(`  拆分份数: ${icebergPlan.splits.length}`);

  console.log('\n  拆分详情 (前10个):');
  icebergPlan.splits.slice(0, 10).forEach((split, i) => {
    console.log(`    第 ${String(i + 1).padStart(2)} 片: 显示 ${split.displaySize.toFixed(4)} / 实际 ${split.actualSize.toFixed(4)} BTC`);
  });

  // 计算隐藏比例
  const totalDisplay = icebergPlan.splits.reduce((sum, s) => sum + s.displaySize, 0);
  const hiddenRatio = 1 - totalDisplay / icebergPlan.totalSize;

  console.log(`\n  隐藏比例: ${(hiddenRatio * 100).toFixed(2)}%`);

  // 线性拆分示例
  const linearPlan = executor.createIcebergPlan({
    symbol: 'BTC/USDT',
    side: 'sell',
    totalSize: 5.0,
    splitStrategy: SPLIT_STRATEGY.LINEAR,
    splitCount: 10,
  });

  console.log('\n线性拆分示例 (卖出 5 BTC):');
  linearPlan.splits.forEach((split, i) => {
    const bar = '█'.repeat(Math.round(split.actualSize / 0.5 * 10));
    console.log(`    ${String(i + 1).padStart(2)}: ${bar} ${split.actualSize.toFixed(4)} BTC`);
  });
}

// ============================================
// 示例 5: 执行 Alpha 引擎 (统一入口)
// Example 5: Execution Alpha Engine (Unified Entry)
// ============================================

async function executionAlphaEngineExample() {
  console.log('\n=== 示例 5: 执行 Alpha 引擎 ===\n');

  // 创建执行 Alpha 引擎
  const engine = createExecutionAlphaEngine({
    verbose: true,
    enableAutoDelay: true,
    enableSlippageRecording: true,
  });

  // 模拟市场数据
  const orderBook = generateMockOrderBook(50000, 20);
  const trades = generateMockTrades(100, 50000);
  const candles = generateMockCandles(24, 50000);

  // 更新市场数据
  engine.updateMarketData('BTC/USDT', {
    orderBook,
    trades,
    candles,
    dailyVolume: 1000,
  });

  // 分析订单并获取执行建议
  const analysis = engine.analyzeOrder({
    symbol: 'BTC/USDT',
    side: 'buy',
    size: 5.0,
    urgency: 0.5,  // 中等紧急程度
  });

  console.log('订单分析结果:');
  console.log(`  订单大小分类: ${analysis.sizeClass}`);
  console.log(`  推荐执行策略: ${analysis.recommendedStrategy}`);
  console.log(`  流动性等级: ${analysis.liquidityLevel}`);
  console.log(`  滑点风险: ${analysis.slippageRisk}`);
  console.log(`  预估滑点: ${(analysis.estimatedSlippage * 100).toFixed(4)}%`);
  console.log(`  建议拆分: ${analysis.suggestSplit ? '是' : '否'}`);

  console.log('\n策略得分:');
  Object.entries(analysis.strategyScores).forEach(([strategy, score]) => {
    const bar = '█'.repeat(Math.round(score * 20));
    console.log(`  ${strategy.padEnd(10)}: ${bar} ${score.toFixed(2)}`);
  });

  // 生成执行计划
  const executionPlan = engine.generateExecutionPlan({
    symbol: 'BTC/USDT',
    side: 'buy',
    size: 5.0,
    strategy: analysis.recommendedStrategy,
    duration: 30 * 60 * 1000,
  });

  console.log('\n生成的执行计划:');
  console.log(`  策略: ${executionPlan.strategy}`);
  console.log(`  步骤数: ${executionPlan.steps.length}`);
  console.log(`  预估时长: ${executionPlan.estimatedDuration / 60000} 分钟`);
  console.log(`  预估滑点节省: ${(executionPlan.estimatedSlippageSaving * 100).toFixed(4)}%`);
}

// ============================================
// 示例 6: 快速分析 (便捷函数)
// Example 6: Quick Analysis (Convenience Function)
// ============================================

async function quickAnalysisExample() {
  console.log('\n=== 示例 6: 快速分析 ===\n');

  // 生成模拟盘口
  const orderBook = generateMockOrderBook(50000, 20);

  // 使用快速分析函数
  const result = quickAnalyze(orderBook, 'BTC/USDT', 'buy', 3.0);

  console.log('快速分析结果:');
  console.log(`\n  盘口分析:`);
  console.log(`    买盘深度: ${result.depthAnalysis.bidDepth.toFixed(4)} BTC`);
  console.log(`    卖盘深度: ${result.depthAnalysis.askDepth.toFixed(4)} BTC`);
  console.log(`    压力方向: ${result.depthAnalysis.pressure}`);

  console.log(`\n  流动性评估:`);
  console.log(`    流动性等级: ${result.liquidityAssessment.level}`);
  console.log(`    可执行比例: ${(result.liquidityAssessment.fillableRatio * 100).toFixed(2)}%`);

  console.log(`\n  冲击估算:`);
  console.log(`    预估滑点: ${(result.impactEstimation.estimatedSlippage * 100).toFixed(4)}%`);
  console.log(`    冲击等级: ${result.impactEstimation.impactLevel}`);

  console.log(`\n  建议: ${result.recommendation}`);
}

// ============================================
// 示例 7: 自适应执行
// Example 7: Adaptive Execution
// ============================================

async function adaptiveExecutionExample() {
  console.log('\n=== 示例 7: 自适应执行 ===\n');

  // 创建执行 Alpha 引擎
  const engine = createExecutionAlphaEngine({
    autoStrategyThresholds: {
      minSizeForAlgo: 0.01,
      minSizeForIceberg: 0.02,
    },
  });

  // 模拟不同大小的订单
  const orderSizes = [0.1, 0.5, 2.0, 5.0, 10.0];
  const orderBook = generateMockOrderBook(50000, 20);

  engine.updateMarketData('BTC/USDT', {
    orderBook,
    dailyVolume: 500,
  });

  console.log('不同订单大小的执行建议:');
  console.log('-'.repeat(70));
  console.log(`${'大小'.padEnd(10)} ${'日均量占比'.padEnd(12)} ${'大小分类'.padEnd(15)} ${'推荐策略'.padEnd(12)} 预估滑点`);
  console.log('-'.repeat(70));

  for (const size of orderSizes) {
    const analysis = engine.analyzeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      size,
    });

    const volumeRatio = (size / 500 * 100).toFixed(2);
    console.log(
      `${size.toString().padEnd(10)} ` +
      `${volumeRatio.padEnd(12)}% ` +
      `${analysis.sizeClass.padEnd(15)} ` +
      `${analysis.recommendedStrategy.padEnd(12)} ` +
      `${(analysis.estimatedSlippage * 100).toFixed(4)}%`
    );
  }

  console.log('-'.repeat(70));
}

// ============================================
// 示例 8: 执行质量监控
// Example 8: Execution Quality Monitoring
// ============================================

async function executionQualityExample() {
  console.log('\n=== 示例 8: 执行质量监控 ===\n');

  // 创建执行 Alpha 引擎
  const engine = createExecutionAlphaEngine({
    enableSlippageRecording: true,
  });

  // 模拟执行并记录结果
  const executions = [
    { expected: 50000, actual: 50010, size: 1.0, strategy: 'direct' },
    { expected: 50000, actual: 50005, size: 2.0, strategy: 'twap' },
    { expected: 50000, actual: 50002, size: 3.0, strategy: 'vwap' },
    { expected: 50000, actual: 50008, size: 1.5, strategy: 'iceberg' },
    { expected: 50000, actual: 50003, size: 2.5, strategy: 'adaptive' },
  ];

  console.log('模拟执行记录:');
  executions.forEach((exec, i) => {
    const slippage = (exec.actual - exec.expected) / exec.expected;
    engine.recordExecution('BTC/USDT', {
      expectedPrice: exec.expected,
      actualPrice: exec.actual,
      size: exec.size,
      side: 'buy',
      strategy: exec.strategy,
      timestamp: Date.now() - i * 3600000,
    });

    console.log(`  ${i + 1}. ${exec.strategy.padEnd(10)} | ${exec.size} BTC | 滑点: ${(slippage * 100).toFixed(4)}%`);
  });

  // 获取执行质量统计
  const stats = engine.getExecutionStats('BTC/USDT');

  console.log('\n执行质量统计:');
  console.log(`  总执行次数: ${stats.totalExecutions}`);
  console.log(`  平均滑点: ${(stats.averageSlippage * 100).toFixed(4)}%`);
  console.log(`  滑点标准差: ${(stats.slippageStdDev * 100).toFixed(4)}%`);
  console.log(`  最佳执行: ${stats.bestExecution.strategy} (${(stats.bestExecution.slippage * 100).toFixed(4)}%)`);
  console.log(`  最差执行: ${stats.worstExecution.strategy} (${(stats.worstExecution.slippage * 100).toFixed(4)}%)`);

  console.log('\n各策略平均滑点:');
  Object.entries(stats.byStrategy).forEach(([strategy, data]) => {
    const bar = '█'.repeat(Math.round(data.avgSlippage * 10000));
    console.log(`  ${strategy.padEnd(10)}: ${bar} ${(data.avgSlippage * 100).toFixed(4)}%`);
  });
}

// ============================================
// 主函数
// Main Function
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           执行 Alpha (Execution Alpha) 示例                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await orderBookAnalysisExample();
    await slippageAnalysisExample();
    await twapVwapExample();
    await icebergExample();
    await executionAlphaEngineExample();
    await quickAnalysisExample();
    await adaptiveExecutionExample();
    await executionQualityExample();

    console.log('\n✅ 所有示例执行完成!\n');

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
    process.exit(1);
  }
}

// 运行示例
main();
