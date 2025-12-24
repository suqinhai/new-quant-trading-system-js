/**
 * 示例：运行波动率策略
 * Example: Run Volatility Strategies
 *
 * 展示如何使用 ATRBreakout / BollingerWidth / VolatilityRegime 策略
 * Demonstrates how to use volatility-based strategies
 */

import 'dotenv/config';
import { createEngine } from '../src/index.js';

// 从命令行参数获取策略类型 / Get strategy type from command line
const strategyType = process.argv[2] || 'ATRBreakout';

/**
 * 策略配置 / Strategy configurations
 */
const strategyConfigs = {
  // ATR 突破策略
  ATRBreakout: {
    name: 'ATRBreakout',
    params: {
      symbols: ['BTC/USDT'],
      timeframe: '1h',
      atrPeriod: 14,
      atrMultiplier: 2.0,
      baselinePeriod: 20,
      useTrailingStop: true,
      stopLossMultiplier: 1.5,
      positionPercent: 95,
    },
  },

  // 布林宽度挤压策略
  BollingerWidth: {
    name: 'BollingerWidth',
    params: {
      symbols: ['BTC/USDT'],
      timeframe: '4h',
      bbPeriod: 20,
      bbStdDev: 2.0,
      kcPeriod: 20,
      kcMultiplier: 1.5,
      squeezeThreshold: 20,
      useMomentumConfirm: true,
      positionPercent: 95,
    },
  },

  // 波动率 Regime 策略
  VolatilityRegime: {
    name: 'VolatilityRegime',
    params: {
      symbols: ['BTC/USDT'],
      timeframe: '1h',
      atrPeriod: 14,
      lowVolThreshold: 25,
      highVolThreshold: 75,
      extremeVolThreshold: 95,
      disableInExtreme: true,
      adxThreshold: 25,
      positionPercent: 95,
    },
  },
};

/**
 * 主函数
 */
async function main() {
  console.log('================================================');
  console.log('    波动率策略示例 / Volatility Strategy Example');
  console.log('================================================\n');

  // 验证策略类型
  if (!strategyConfigs[strategyType]) {
    console.error(`未知策略: ${strategyType}`);
    console.log('可用策略: ATRBreakout, BollingerWidth, VolatilityRegime');
    process.exit(1);
  }

  const config = strategyConfigs[strategyType];
  console.log(`[Volatility] 选择策略: ${strategyType}`);
  console.log(`[Volatility] 参数:`, JSON.stringify(config.params, null, 2));

  // 创建交易引擎
  const engine = createEngine({
    exchange: {
      default: 'binance',
      binance: {
        sandbox: true,
      },
    },
    risk: {
      maxPositionRatio: 0.1,
      maxRiskPerTrade: 0.02,
      maxDailyLoss: 200,
    },
  });

  // 事件监听
  engine.on('initialized', () => {
    console.log('[Volatility] 引擎初始化完成');
  });

  engine.on('strategyStarted', (data) => {
    console.log(`[Volatility] 策略已启动: ${data.name}`);
  });

  engine.on('signal', (data) => {
    console.log(`[Volatility] 信号: ${data.action} ${data.symbol} @ ${data.price}`);
  });

  engine.on('orderExecuted', (data) => {
    console.log(`[Volatility] 订单执行:`, data.result);
  });

  try {
    console.log('\n[Volatility] 启动交易引擎...\n');
    await engine.start();

    console.log(`[Volatility] 启动 ${strategyType} 策略...\n`);
    await engine.runStrategy(strategyType, config.params);

    const status = engine.getStatus();
    console.log('\n[Volatility] 引擎状态:');
    console.log(JSON.stringify(status, null, 2));

    console.log('\n[Volatility] 策略运行中，按 Ctrl+C 停止\n');

  } catch (error) {
    console.error('[Volatility] 启动失败:', error);
    process.exit(1);
  }

  // 优雅退出
  const shutdown = async () => {
    console.log('\n[Volatility] 正在停止...');
    await engine.stop();
    console.log('[Volatility] 已停止');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
