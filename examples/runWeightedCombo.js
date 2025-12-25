/**
 * 加权组合策略运行示例
 * Weighted Combo Strategy Example
 *
 * 此示例展示如何使用 WeightedComboStrategy，
 * 该策略整合多个子策略信号，使用加权打分制决定交易。
 *
 * 核心功能：
 * 1. 策略打分制 (Signal Score) - 每个策略输出 0-1 分数
 * 2. 策略权重动态调整 - 基于历史表现调整权重
 * 3. 最大相关性限制 - 高相关策略限制总权重
 * 4. 策略熔断机制 - 表现差时暂停策略
 *
 * 示例配置：
 *   SMA = 0.4, RSI = 0.2, MACD = 0.4
 *   总分 >= 0.7 才交易
 */

import { WeightedComboStrategy } from '../src/strategies/WeightedComboStrategy.js';
import { SignalWeightingSystem, StrategyStatus } from '../src/strategies/SignalWeightingSystem.js';

// ============================================
// 配置参数
// ============================================

/**
 * 示例 1: 基础配置
 * SMA + RSI + MACD 组合
 */
const basicConfig = {
  // 基础配置
  symbol: 'BTC/USDT',
  positionPercent: 95,

  // 策略权重配置
  // 总权重应该为 1.0（非强制要求，系统会归一化）
  strategyWeights: {
    SMA: 0.4,   // 趋势策略权重 40%
    RSI: 0.2,   // 超买超卖策略权重 20%
    MACD: 0.4,  // MACD 策略权重 40%
  },

  // 交易阈值
  buyThreshold: 0.7,   // 总分 >= 0.7 买入
  sellThreshold: 0.3,  // 总分 <= 0.3 卖出

  // 子策略参数
  smaParams: { shortPeriod: 10, longPeriod: 30 },
  rsiParams: { period: 14, overbought: 70, oversold: 30 },
  macdParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },

  // 止盈止损
  takeProfitPercent: 3.0,
  stopLossPercent: 1.5,
};

/**
 * 示例 2: 高级配置
 * 包含资金费率策略 + 动态权重 + 熔断
 */
const advancedConfig = {
  symbol: 'BTC/USDT',
  positionPercent: 80,

  // 策略权重
  strategyWeights: {
    SMA: 0.3,
    RSI: 0.2,
    MACD: 0.2,
    BollingerBands: 0.3,
  },

  buyThreshold: 0.65,
  sellThreshold: 0.35,

  // 动态权重调整
  dynamicWeights: true,
  adjustmentFactor: 0.2,      // 权重调整幅度
  evaluationPeriod: 20,       // 每 20 笔交易评估一次
  minWeight: 0.05,            // 最小权重
  maxWeight: 0.6,             // 最大权重

  // 相关性限制
  correlationLimit: true,
  maxCorrelation: 0.7,        // 最大允许相关性
  correlationPenaltyFactor: 0.5, // 相关性惩罚系数
  correlationMatrix: {
    'SMA-MACD': 0.6,          // SMA 和 MACD 相关性较高
    'SMA-RSI': 0.3,           // SMA 和 RSI 相关性中等
    'RSI-BollingerBands': 0.4, // RSI 和布林带相关性中等
    'MACD-BollingerBands': 0.5,
  },

  // 熔断机制
  circuitBreaker: true,
  consecutiveLossLimit: 5,    // 连续亏损 5 次触发熔断
  maxDrawdownLimit: 0.15,     // 回撤 15% 触发熔断
  minWinRate: 0.3,            // 胜率低于 30% 触发熔断
  evaluationWindow: 30,       // 评估窗口 30 笔交易
  coolingPeriod: 3600000,     // 冷却期 1 小时
  autoRecover: true,          // 自动恢复

  // 止盈止损
  takeProfitPercent: 2.5,
  stopLossPercent: 1.0,
};

// ============================================
// 示例 1: 基础用法
// ============================================

async function basicExample() {
  console.log('='.repeat(60));
  console.log('示例 1: 基础用法');
  console.log('='.repeat(60));

  // 创建策略实例
  const strategy = new WeightedComboStrategy(basicConfig);

  // 初始化
  await strategy.onInit();

  console.log('\n策略配置:');
  console.log(`  交易对: ${strategy.symbol}`);
  console.log(`  买入阈值: ${strategy.buyThreshold}`);
  console.log(`  卖出阈值: ${strategy.sellThreshold}`);
  console.log(`  策略权重: ${JSON.stringify(strategy.strategyWeights)}`);

  // 监听事件
  strategy.on('signal', (signal) => {
    console.log(`\n[信号] ${signal.type.toUpperCase()}`);
    console.log(`  原因: ${signal.reason}`);
  });

  strategy.on('strategyCircuitBreak', (data) => {
    console.log(`\n[熔断] 策略 ${data.strategy} 被熔断`);
    console.log(`  原因: ${data.reason}`);
  });

  // 模拟 K 线数据
  console.log('\n处理 K 线数据...');
  const candles = generateMockCandles(100, 50000, 'trending_up');

  for (let i = 50; i < candles.length; i++) {
    await strategy.onTick(candles[i], candles.slice(0, i + 1));
  }

  // 输出结果
  console.log('\n当前指标:');
  console.log(`  组合得分: ${strategy.getIndicator('comboScore')?.toFixed(3) || 'N/A'}`);
  console.log(`  买入得分: ${strategy.getIndicator('buyScore')?.toFixed(3) || 'N/A'}`);
  console.log(`  卖出得分: ${strategy.getIndicator('sellScore')?.toFixed(3) || 'N/A'}`);
  console.log(`  交易动作: ${strategy.getIndicator('action') || 'N/A'}`);

  await strategy.onFinish();

  return strategy;
}

// ============================================
// 示例 2: 独立使用 SignalWeightingSystem
// ============================================

async function signalWeightingSystemExample() {
  console.log('\n' + '='.repeat(60));
  console.log('示例 2: 独立使用 SignalWeightingSystem');
  console.log('='.repeat(60));

  // 创建权重系统
  const weightSystem = new SignalWeightingSystem({
    threshold: 0.7,
    sellThreshold: 0.3,
    baseWeights: {
      SMA: 0.4,
      RSI: 0.2,
      FundingRate: 0.4,
    },
    // 启用动态权重
    dynamicWeights: true,
    // 启用相关性限制
    correlationLimit: true,
    maxCorrelation: 0.7,
    // 启用熔断
    circuitBreaker: true,
    consecutiveLossLimit: 3,
  });

  // 注册策略
  weightSystem.registerStrategies({
    SMA: 0.4,
    RSI: 0.2,
    FundingRate: 0.4,
  });

  // 设置相关性
  weightSystem.setCorrelation('SMA', 'RSI', 0.3);
  weightSystem.setCorrelation('SMA', 'FundingRate', 0.1);
  weightSystem.setCorrelation('RSI', 'FundingRate', 0.2);

  // 监听事件
  weightSystem.on('scoreCalculated', (result) => {
    console.log(`  综合得分: ${result.score.toFixed(3)}, 动作: ${result.action}`);
  });

  weightSystem.on('circuitBreak', (data) => {
    console.log(`  [熔断] ${data.strategy}: ${data.reason}`);
  });

  // 模拟多轮信号
  console.log('\n模拟信号输入...');

  // 轮次 1: 看多信号
  console.log('\n[轮次 1] 看多信号');
  weightSystem.recordSignal('SMA', 0.8);      // SMA 看多
  weightSystem.recordSignal('RSI', 0.7);      // RSI 从超卖回升
  weightSystem.recordSignal('FundingRate', 0.6); // 负费率，利于做多
  let result = weightSystem.calculateScore();
  console.log(`  信号明细:`, Object.entries(result.signals).map(([k, v]) => `${k}:${v.rawScore.toFixed(2)}`).join(', '));
  console.log(`  应该交易: ${result.shouldTrade}`);
  weightSystem.clearCurrentSignals();

  // 轮次 2: 中性信号
  console.log('\n[轮次 2] 中性信号');
  weightSystem.recordSignal('SMA', 0.5);      // SMA 中性
  weightSystem.recordSignal('RSI', 0.5);      // RSI 中性
  weightSystem.recordSignal('FundingRate', 0.5); // 费率中性
  result = weightSystem.calculateScore();
  console.log(`  信号明细:`, Object.entries(result.signals).map(([k, v]) => `${k}:${v.rawScore.toFixed(2)}`).join(', '));
  console.log(`  应该交易: ${result.shouldTrade}`);
  weightSystem.clearCurrentSignals();

  // 轮次 3: 看空信号
  console.log('\n[轮次 3] 看空信号');
  weightSystem.recordSignal('SMA', 0.2);      // SMA 看空
  weightSystem.recordSignal('RSI', 0.3);      // RSI 超买
  weightSystem.recordSignal('FundingRate', 0.2); // 正费率，利于做空
  result = weightSystem.calculateScore();
  console.log(`  信号明细:`, Object.entries(result.signals).map(([k, v]) => `${k}:${v.rawScore.toFixed(2)}`).join(', '));
  console.log(`  应该交易: ${result.shouldTrade}`);
  weightSystem.clearCurrentSignals();

  // 模拟交易表现更新
  console.log('\n模拟交易表现...');

  // 模拟亏损触发熔断
  for (let i = 0; i < 4; i++) {
    weightSystem.updatePerformance('RSI', { profit: -0.01, win: false });
    console.log(`  RSI 策略亏损 ${i + 1} 次`);
  }

  // 检查状态
  console.log('\n策略状态:');
  const status = weightSystem.getAllStatus();
  for (const [name, s] of Object.entries(status)) {
    console.log(`  ${name}: ${s.status}, 权重 ${s.weight.toFixed(2)}`);
  }

  return weightSystem;
}

// ============================================
// 示例 3: 动态权重调整
// ============================================

async function dynamicWeightExample() {
  console.log('\n' + '='.repeat(60));
  console.log('示例 3: 动态权重调整');
  console.log('='.repeat(60));

  const weightSystem = new SignalWeightingSystem({
    threshold: 0.7,
    sellThreshold: 0.3,
    baseWeights: {
      Strategy_A: 0.33,
      Strategy_B: 0.33,
      Strategy_C: 0.34,
    },
    dynamicWeights: true,
    adjustmentFactor: 0.3,
    evaluationPeriod: 10,
    minWeight: 0.1,
    maxWeight: 0.6,
  });

  weightSystem.registerStrategies({
    Strategy_A: 0.33,
    Strategy_B: 0.33,
    Strategy_C: 0.34,
  });

  weightSystem.on('weightAdjusted', (data) => {
    console.log(`  权重调整: ${data.strategy} ${data.oldWeight.toFixed(3)} → ${data.newWeight.toFixed(3)}`);
    console.log(`    胜率: ${(data.winRate * 100).toFixed(1)}%`);
  });

  console.log('\n初始权重:', weightSystem.getWeights());

  // 模拟策略 A 表现好
  console.log('\n模拟 Strategy_A 表现优秀 (80% 胜率)...');
  for (let i = 0; i < 10; i++) {
    const win = Math.random() < 0.8;
    weightSystem.updatePerformance('Strategy_A', {
      profit: win ? 0.02 : -0.01,
      win,
    });
  }

  // 模拟策略 B 表现差
  console.log('\n模拟 Strategy_B 表现较差 (30% 胜率)...');
  for (let i = 0; i < 10; i++) {
    const win = Math.random() < 0.3;
    weightSystem.updatePerformance('Strategy_B', {
      profit: win ? 0.02 : -0.01,
      win,
    });
  }

  // 模拟策略 C 表现中等
  console.log('\n模拟 Strategy_C 表现中等 (50% 胜率)...');
  for (let i = 0; i < 10; i++) {
    const win = Math.random() < 0.5;
    weightSystem.updatePerformance('Strategy_C', {
      profit: win ? 0.02 : -0.01,
      win,
    });
  }

  console.log('\n调整后权重:', weightSystem.getWeights());

  // 打印表现统计
  console.log('\n各策略表现:');
  for (const name of ['Strategy_A', 'Strategy_B', 'Strategy_C']) {
    const perf = weightSystem.getPerformance(name);
    console.log(`  ${name}:`);
    console.log(`    交易: ${perf.trades}, 胜: ${perf.wins}, 负: ${perf.losses}`);
    console.log(`    胜率: ${(perf.wins / perf.trades * 100).toFixed(1)}%`);
  }

  return weightSystem;
}

// ============================================
// 示例 4: 相关性限制
// ============================================

async function correlationLimitExample() {
  console.log('\n' + '='.repeat(60));
  console.log('示例 4: 相关性限制');
  console.log('='.repeat(60));

  const weightSystem = new SignalWeightingSystem({
    threshold: 0.7,
    baseWeights: {
      SMA: 0.5,
      MACD: 0.5,
    },
    correlationLimit: true,
    maxCorrelation: 0.5,
    correlationPenaltyFactor: 0.6,
    correlationMatrix: {
      'SMA-MACD': 0.8, // 高相关性
    },
  });

  weightSystem.registerStrategies({
    SMA: 0.5,
    MACD: 0.5,
  });

  console.log('\n配置:');
  console.log(`  SMA 权重: 0.5`);
  console.log(`  MACD 权重: 0.5`);
  console.log(`  SMA-MACD 相关性: 0.8 (高)`);
  console.log(`  最大允许相关性: 0.5`);
  console.log(`  惩罚系数: 0.6`);

  // 记录信号
  weightSystem.recordSignal('SMA', 0.8);
  weightSystem.recordSignal('MACD', 0.8);

  const result = weightSystem.calculateScore();

  console.log('\n计算结果:');
  console.log(`  综合得分: ${result.score.toFixed(3)}`);
  console.log(`  总有效权重: ${result.totalWeight.toFixed(3)} (因相关性惩罚降低)`);

  for (const [name, signal] of Object.entries(result.signals)) {
    console.log(`  ${name}:`);
    console.log(`    原始权重: 0.5`);
    console.log(`    有效权重: ${signal.weight.toFixed(3)}`);
    console.log(`    贡献: ${signal.contribution.toFixed(3)}`);
  }

  return weightSystem;
}

// ============================================
// 示例 5: 熔断机制
// ============================================

async function circuitBreakerExample() {
  console.log('\n' + '='.repeat(60));
  console.log('示例 5: 熔断机制');
  console.log('='.repeat(60));

  const weightSystem = new SignalWeightingSystem({
    threshold: 0.7,
    baseWeights: {
      RiskyStrategy: 0.5,
      SafeStrategy: 0.5,
    },
    circuitBreaker: true,
    consecutiveLossLimit: 3,
    maxDrawdownLimit: 0.1,
    minWinRate: 0.35,
    evaluationWindow: 10,
    coolingPeriod: 5000, // 5 秒冷却（演示用）
    autoRecover: true,
  });

  weightSystem.registerStrategies({
    RiskyStrategy: 0.5,
    SafeStrategy: 0.5,
  });

  weightSystem.on('circuitBreak', (data) => {
    console.log(`\n[熔断触发]`);
    console.log(`  策略: ${data.strategy}`);
    console.log(`  原因: ${data.reason}`);
    console.log(`  冷却至: ${new Date(data.cooldownUntil).toLocaleTimeString()}`);
  });

  weightSystem.on('strategyRecovered', (data) => {
    console.log(`\n[策略恢复] ${data.strategy}`);
  });

  console.log('\n模拟 RiskyStrategy 连续亏损...');

  for (let i = 0; i < 5; i++) {
    console.log(`  亏损 ${i + 1}`);
    weightSystem.updatePerformance('RiskyStrategy', {
      profit: -0.02,
      win: false,
    });

    const status = weightSystem.getStrategyStatus('RiskyStrategy');
    console.log(`    状态: ${status.status}`);

    if (status.status !== StrategyStatus.ACTIVE) {
      break;
    }
  }

  // 测试熔断期间的信号
  console.log('\n熔断期间记录信号...');
  weightSystem.recordSignal('RiskyStrategy', 0.9); // 熔断中，会被设为 0.5
  weightSystem.recordSignal('SafeStrategy', 0.8);

  const result = weightSystem.calculateScore();
  console.log(`  综合得分: ${result.score.toFixed(3)}`);
  console.log(`  RiskyStrategy 信号: ${result.signals.RiskyStrategy.rawScore.toFixed(2)} (被中和)`);
  console.log(`  SafeStrategy 信号: ${result.signals.SafeStrategy.rawScore.toFixed(2)}`);

  // 手动恢复
  console.log('\n手动恢复策略...');
  weightSystem.recoverStrategy('RiskyStrategy');

  const finalStatus = weightSystem.getStrategyStatus('RiskyStrategy');
  console.log(`  最终状态: ${finalStatus.status}`);

  return weightSystem;
}

// ============================================
// 示例 6: 完整交易流程
// ============================================

async function fullTradingExample() {
  console.log('\n' + '='.repeat(60));
  console.log('示例 6: 完整交易流程模拟');
  console.log('='.repeat(60));

  const strategy = new WeightedComboStrategy(advancedConfig);

  await strategy.onInit();

  // 统计
  const stats = {
    buySignals: 0,
    sellSignals: 0,
    circuitBreaks: 0,
  };

  strategy.on('signal', (signal) => {
    if (signal.type === 'buy') stats.buySignals++;
    if (signal.type === 'sell') stats.sellSignals++;
  });

  strategy.on('strategyCircuitBreak', () => {
    stats.circuitBreaks++;
  });

  // 模拟市场周期
  console.log('\n模拟市场数据...');

  // 阶段 1: 震荡期
  console.log('\n[阶段 1] 震荡盘整期 (50 根 K 线)');
  const rangingCandles = generateMockCandles(50, 50000, 'ranging');
  await processCandles(strategy, rangingCandles, 30);
  console.log(`  当前得分: ${strategy.getIndicator('comboScore')?.toFixed(3) || 'N/A'}`);

  // 阶段 2: 上涨趋势
  console.log('\n[阶段 2] 上涨趋势期 (50 根 K 线)');
  const trendingCandles = generateMockCandles(50, 51000, 'trending_up');
  await processCandles(strategy, trendingCandles, 30);
  console.log(`  当前得分: ${strategy.getIndicator('comboScore')?.toFixed(3) || 'N/A'}`);

  // 阶段 3: 下跌趋势
  console.log('\n[阶段 3] 下跌趋势期 (50 根 K 线)');
  const downTrendCandles = generateMockCandles(50, 55000, 'trending_down');
  await processCandles(strategy, downTrendCandles, 30);
  console.log(`  当前得分: ${strategy.getIndicator('comboScore')?.toFixed(3) || 'N/A'}`);

  // 输出统计
  console.log('\n' + '-'.repeat(40));
  console.log('交易统计:');
  console.log(`  买入信号: ${stats.buySignals}`);
  console.log(`  卖出信号: ${stats.sellSignals}`);
  console.log(`  策略熔断: ${stats.circuitBreaks}`);

  // 打印权重变化
  console.log('\n当前权重:');
  const weights = strategy.getWeights();
  for (const [name, weight] of Object.entries(weights)) {
    const baseWeight = advancedConfig.strategyWeights[name];
    const change = ((weight - baseWeight) / baseWeight * 100).toFixed(1);
    console.log(`  ${name}: ${weight.toFixed(3)} (${change > 0 ? '+' : ''}${change}%)`);
  }

  await strategy.onFinish();

  return strategy;
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
        change = 30 + Math.random() * 20;
        break;
      case 'trending_down':
        change = -30 - Math.random() * 20;
        break;
      case 'high_volatility':
        change = (Math.random() - 0.5) * 300;
        break;
      case 'ranging':
      default:
        change = Math.sin(i * 0.2) * 50 + (Math.random() - 0.5) * 30;
        break;
    }

    price = Math.max(100, price + change);

    const volatility = type === 'high_volatility' ? 200 : 50;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + volatility,
      low: Math.max(100, price - volatility),
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 处理 K 线数据
 */
async function processCandles(strategy, candles, minHistory = 30) {
  for (let i = minHistory; i < candles.length; i++) {
    await strategy.onTick(candles[i], candles.slice(0, i + 1));
  }
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('加权组合策略 (WeightedComboStrategy) 示例');
  console.log('='.repeat(60));
  console.log('');
  console.log('核心功能:');
  console.log('  1. 策略打分制 - 每个策略输出 0-1 分数');
  console.log('  2. 策略权重动态调整 - 基于表现自动调整');
  console.log('  3. 最大相关性限制 - 降低高相关策略权重');
  console.log('  4. 策略熔断机制 - 表现差时暂停策略');
  console.log('');

  try {
    // 运行所有示例
    await basicExample();
    await signalWeightingSystemExample();
    await dynamicWeightExample();
    await correlationLimitExample();
    await circuitBreakerExample();
    await fullTradingExample();

    console.log('\n' + '='.repeat(60));
    console.log('所有示例运行完成');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('示例运行错误:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
main().catch(console.error);
