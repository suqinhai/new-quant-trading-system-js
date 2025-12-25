/**
 * 因子投资策略示例
 * Factor Investing Strategy Example
 *
 * 演示如何使用 Alpha 因子库进行多因子投资
 * Demonstrates how to use Alpha Factor Library for multi-factor investing
 */

import {
  // 因子库核心
  FactorRegistry,
  FactorCombiner,
  FactorInvestingStrategy,
  NORMALIZATION_METHOD,
  COMBINATION_METHOD,
  POSITION_TYPE,
  WEIGHT_METHOD,

  // 预定义因子
  Momentum7D,
  Momentum30D,
  BollingerWidth20,
  MFI14,
  CMF20,
  RelativeVolume,
  FundingRatePercentile,
  LargeOrderImbalance,

  // 工厂函数
  createMomentumFactor,
  createFullRegistry,

  // 常量
  FACTOR_DIRECTION,
} from '../src/factors/index.js';

// ============================================
// 示例 1: 基础因子计算
// Example 1: Basic Factor Calculation
// ============================================

async function basicFactorExample() {
  console.log('\n=== 示例 1: 基础因子计算 ===\n');

  // 创建 7 天动量因子
  const momentum7d = Momentum7D;

  // 模拟 K 线数据
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
    open: 100 + Math.random() * 10,
    high: 105 + Math.random() * 10,
    low: 95 + Math.random() * 10,
    close: 100 + i * 0.5 + Math.random() * 5, // 轻微上涨趋势
    volume: 1000000 + Math.random() * 500000,
  }));

  // 计算因子值
  const value = await momentum7d.calculate('BTC/USDT', { candles: mockCandles });

  console.log(`BTC/USDT 7天动量: ${(value * 100).toFixed(2)}%`);
  console.log(`因子信息:`, momentum7d.getInfo());
}

// ============================================
// 示例 2: 多因子批量计算
// Example 2: Multi-Factor Batch Calculation
// ============================================

async function multiFactorExample() {
  console.log('\n=== 示例 2: 多因子批量计算 ===\n');

  // 创建因子注册表
  const registry = new FactorRegistry();

  // 注册因子
  registry.register(Momentum7D);
  registry.register(Momentum30D);
  registry.register(BollingerWidth20);
  registry.register(MFI14);
  registry.register(RelativeVolume);

  console.log(`注册因子数: ${registry.getNames().length}`);
  console.log(`因子列表: ${registry.getNames().join(', ')}`);

  // 准备多资产数据
  const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'];
  const dataMap = {};

  symbols.forEach((symbol, index) => {
    // 模拟不同资产的 K 线数据
    dataMap[symbol] = {
      candles: Array.from({ length: 60 }, (_, i) => ({
        timestamp: Date.now() - (60 - i) * 24 * 60 * 60 * 1000,
        open: 100 + Math.random() * 10,
        high: 105 + Math.random() * 10,
        low: 95 + Math.random() * 10,
        close: 100 + (index - 2) * i * 0.1 + Math.random() * 5, // 不同趋势
        volume: 1000000 + Math.random() * 500000,
      })),
    };
  });

  // 批量计算所有因子
  const factorValues = await registry.calculateBatch(registry.getNames(), dataMap);

  // 打印结果
  console.log('\n因子值矩阵:');
  console.log('Symbol\t\t', registry.getNames().join('\t'));
  console.log('-'.repeat(80));

  for (const symbol of symbols) {
    const values = registry.getNames().map(fname => {
      const val = factorValues.get(fname)?.get(symbol);
      return val !== null ? val.toFixed(4) : 'N/A';
    });
    console.log(`${symbol}\t`, values.join('\t\t'));
  }
}

// ============================================
// 示例 3: 因子组合和排名
// Example 3: Factor Combination and Ranking
// ============================================

async function factorCombinerExample() {
  console.log('\n=== 示例 3: 因子组合和排名 ===\n');

  // 创建因子注册表
  const registry = new FactorRegistry();
  registry.register(Momentum7D);
  registry.register(Momentum30D);
  registry.register(MFI14);

  // 创建因子组合器
  const combiner = new FactorCombiner({
    factorWeights: {
      'Momentum_7d': 0.4,
      'Momentum_30d': 0.3,
      'MFI_14': 0.3,
    },
    factorDirections: {
      'Momentum_7d': FACTOR_DIRECTION.POSITIVE,
      'Momentum_30d': FACTOR_DIRECTION.POSITIVE,
      'MFI_14': FACTOR_DIRECTION.POSITIVE,
    },
    normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
    combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE,
  });

  // 准备数据
  const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
                   'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT'];
  const dataMap = {};

  symbols.forEach((symbol, index) => {
    dataMap[symbol] = {
      candles: Array.from({ length: 60 }, (_, i) => ({
        timestamp: Date.now() - (60 - i) * 24 * 60 * 60 * 1000,
        open: 100,
        high: 110,
        low: 90,
        close: 100 + (index - 5) * i * 0.05 + (Math.random() - 0.5) * 10,
        volume: 1000000 + Math.random() * 500000,
      })),
    };
  });

  // 计算因子值
  const factorValues = await registry.calculateBatch(registry.getNames(), dataMap);

  // 计算综合得分
  const scores = combiner.calculateScores(factorValues, symbols);

  // 生成排名
  const rankings = combiner.generateRankings(scores, 'descending');

  console.log('综合排名 (高分优先):');
  console.log('Rank\tSymbol\t\tScore\t\tPercentile');
  console.log('-'.repeat(50));

  rankings.forEach(r => {
    console.log(`${r.rank}\t${r.symbol}\t${r.score.toFixed(4)}\t\t${r.percentile.toFixed(1)}%`);
  });

  // Top N / Bottom N
  const topBottom = combiner.getTopBottomN(scores, 3, 3);

  console.log('\n--- 多空选择 ---');
  console.log('做多 (Top 3):', topBottom.long.map(r => r.symbol).join(', '));
  console.log('做空 (Bottom 3):', topBottom.short.map(r => r.symbol).join(', '));
}

// ============================================
// 示例 4: 完整因子投资策略
// Example 4: Complete Factor Investing Strategy
// ============================================

async function factorInvestingStrategyExample() {
  console.log('\n=== 示例 4: 因子投资策略 ===\n');

  // 创建策略
  const strategy = new FactorInvestingStrategy({
    name: 'MultiFactorStrategy',
    symbols: [
      'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
      'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT',
    ],

    // 因子配置
    factorConfig: {
      momentum: {
        enabled: true,
        totalWeight: 0.4,
        riskAdjusted: true,
      },
      volatility: {
        enabled: true,
        totalWeight: 0.15,
      },
      moneyFlow: {
        enabled: true,
        totalWeight: 0.25,
      },
      turnover: {
        enabled: true,
        totalWeight: 0.2,
      },
      fundingRate: {
        enabled: false, // 需要实时数据
      },
      largeOrder: {
        enabled: false, // 需要成交明细数据
      },
    },

    // 选股参数
    topN: 3,
    bottomN: 3,
    positionType: POSITION_TYPE.LONG_SHORT,
    weightMethod: WEIGHT_METHOD.EQUAL,

    // 再平衡
    rebalancePeriod: 24 * 60 * 60 * 1000, // 每天
    maxPositionPerAsset: 0.15,
  });

  // 初始化
  await strategy.onInit();

  console.log('策略信息:', strategy.getInfo());
}

// ============================================
// 示例 5: 自定义因子
// Example 5: Custom Factor
// ============================================

async function customFactorExample() {
  console.log('\n=== 示例 5: 自定义因子 ===\n');

  // 使用工厂函数创建自定义周期的动量因子
  const momentum14d = createMomentumFactor(14, 'simple', {
    name: 'Custom_Momentum_14d',
    minDataPoints: 10,
  });

  console.log('自定义因子信息:', momentum14d.getInfo());

  // 计算
  const mockCandles = Array.from({ length: 20 }, (_, i) => ({
    timestamp: Date.now() - (20 - i) * 24 * 60 * 60 * 1000,
    open: 100,
    high: 110,
    low: 90,
    close: 100 + i * 0.8,
    volume: 1000000,
  }));

  const value = await momentum14d.calculate('TEST/USDT', { candles: mockCandles });
  console.log(`14天动量值: ${(value * 100).toFixed(2)}%`);
}

// ============================================
// 示例 6: 使用完整因子库
// Example 6: Using Full Factor Library
// ============================================

async function fullLibraryExample() {
  console.log('\n=== 示例 6: 完整因子库 ===\n');

  // 创建包含所有预定义因子的注册表
  const registry = createFullRegistry();

  console.log(`完整因子库包含 ${registry.getNames().length} 个因子:`);

  // 按类别显示
  const stats = registry.getStats();
  console.log('\n按类别统计:');
  Object.entries(stats.byCategory).forEach(([category, count]) => {
    if (count > 0) {
      console.log(`  ${category}: ${count} 个因子`);
    }
  });

  console.log('\n因子列表:');
  registry.getNames().forEach(name => {
    const factor = registry.get(name);
    console.log(`  - ${name} (${factor.category}): ${factor.description}`);
  });
}

// ============================================
// 主函数
// Main Function
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Alpha 因子库 (Factor Investing) 示例               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await basicFactorExample();
    await multiFactorExample();
    await factorCombinerExample();
    await factorInvestingStrategyExample();
    await customFactorExample();
    await fullLibraryExample();

    console.log('\n✅ 所有示例执行完成!\n');

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
    process.exit(1);
  }
}

// 运行示例
main();
