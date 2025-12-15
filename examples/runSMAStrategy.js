/**
 * 示例：运行 SMA 双均线策略
 * Example: Run SMA Dual Moving Average Strategy
 *
 * 展示如何使用交易引擎运行策略
 * Demonstrates how to use trading engine to run strategies
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入交易引擎 / Import trading engine
import { createEngine } from '../src/index.js';

/**
 * 主函数
 * Main function
 */
async function main() {
  console.log('================================================');
  console.log('    量化交易系统示例 / Quant Trading Example');
  console.log('================================================\n');

  // 创建交易引擎 / Create trading engine
  const engine = createEngine({
    // 交易所配置 / Exchange configuration
    exchange: {
      default: 'binance',
      binance: {
        sandbox: true,  // 使用沙盒模式 / Use sandbox mode
      },
    },

    // 风控配置 / Risk configuration
    risk: {
      maxPositionRatio: 0.1,   // 最大持仓 10% / Max position 10%
      maxRiskPerTrade: 0.01,   // 单笔风险 1% / Risk per trade 1%
      maxDailyLoss: 100,       // 日亏损限制 100 USDT / Daily loss limit
    },
  });

  // 监听事件 / Listen to events
  engine.on('initialized', () => {
    console.log('[Example] 引擎初始化完成 / Engine initialized');
  });

  engine.on('started', () => {
    console.log('[Example] 引擎已启动 / Engine started');
  });

  engine.on('strategyStarted', (data) => {
    console.log(`[Example] 策略已启动 / Strategy started: ${data.name}`);
  });

  engine.on('signalRejected', (data) => {
    console.log(`[Example] 信号被拒绝 / Signal rejected: ${data.reason}`);
  });

  engine.on('orderExecuted', (data) => {
    console.log(`[Example] 订单已执行 / Order executed:`, data.result);
  });

  try {
    // 启动引擎 / Start engine
    console.log('[Example] 启动交易引擎 / Starting trading engine...\n');
    await engine.start();

    // 运行 SMA 策略 / Run SMA strategy
    console.log('[Example] 启动 SMA 策略 / Starting SMA strategy...\n');
    await engine.runStrategy('sma', {
      // 交易对列表 / Trading pairs
      symbols: ['BTC/USDT', 'ETH/USDT'],

      // 时间周期 / Timeframe
      timeframe: '1h',

      // 策略参数 / Strategy parameters
      fastPeriod: 10,   // 快线周期 / Fast period
      slowPeriod: 20,   // 慢线周期 / Slow period

      // 资金和风险 / Capital and risk
      capitalRatio: 0.1,  // 使用 10% 资金 / Use 10% capital
      stopLoss: 0.02,     // 止损 2% / Stop loss 2%
      takeProfit: 0.04,   // 止盈 4% / Take profit 4%
    });

    // 获取状态 / Get status
    const status = engine.getStatus();
    console.log('\n[Example] 引擎状态 / Engine status:');
    console.log(JSON.stringify(status, null, 2));

    // 保持运行 / Keep running
    console.log('\n[Example] 策略运行中，按 Ctrl+C 停止 / Strategy running, press Ctrl+C to stop\n');

  } catch (error) {
    console.error('[Example] 启动失败 / Start failed:', error);
    process.exit(1);
  }

  // 优雅退出 / Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Example] 正在停止 / Stopping...');
    await engine.stop();
    console.log('[Example] 已停止 / Stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// 运行主函数 / Run main function
main().catch(console.error);
