/**
 * 示例：运行多周期共振策略
 * Example: Run Multi-Timeframe Resonance Strategy
 *
 * 展示如何使用交易引擎运行多周期共振策略
 * Demonstrates how to use trading engine to run multi-timeframe strategy
 *
 * 策略逻辑 / Strategy Logic:
 * 1H 判趋势 → 15M 等回调 → 5M 择时入场
 * 1H trend → 15M pullback → 5M entry trigger
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
  console.log('    多周期共振策略示例 / Multi-Timeframe Example');
  console.log('================================================\n');

  console.log('策略说明 / Strategy Description:');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  1H  │ 趋势判断 │ SMA(10) vs SMA(30)        │');
  console.log('│ 15M  │ 回调识别 │ RSI < 40 或 回撤 > 1.5%   │');
  console.log('│  5M  │ 入场触发 │ RSI 回升 或 金叉          │');
  console.log('└─────────────────────────────────────────────┘\n');

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
      maxPositionRatio: 0.3,   // 最大持仓 30% / Max position 30%
      maxRiskPerTrade: 0.02,   // 单笔风险 2% / Risk per trade 2%
      maxDailyLoss: 500,       // 日亏损限制 500 USDT / Daily loss limit
    },
  });

  // 监听事件 / Listen to events
  engine.on('initialized', () => {
    console.log('[MTF] 引擎初始化完成 / Engine initialized');
  });

  engine.on('started', () => {
    console.log('[MTF] 引擎已启动 / Engine started');
  });

  engine.on('strategyStarted', (data) => {
    console.log(`[MTF] 策略已启动 / Strategy started: ${data.name}`);
  });

  engine.on('signal', (data) => {
    console.log(`[MTF] 收到信号 / Signal received:`);
    console.log(`      类型 / Type: ${data.type}`);
    console.log(`      原因 / Reason: ${data.reason}`);
    console.log(`      价格 / Price: ${data.price}`);
  });

  engine.on('signalRejected', (data) => {
    console.log(`[MTF] 信号被拒绝 / Signal rejected: ${data.reason}`);
  });

  engine.on('orderExecuted', (data) => {
    console.log(`[MTF] 订单已执行 / Order executed:`);
    console.log(`      方向 / Side: ${data.result?.side}`);
    console.log(`      数量 / Amount: ${data.result?.amount}`);
    console.log(`      价格 / Price: ${data.result?.price}`);
  });

  try {
    // 启动引擎 / Start engine
    console.log('[MTF] 启动交易引擎 / Starting trading engine...\n');
    await engine.start();

    // 运行多周期共振策略 / Run Multi-Timeframe strategy
    console.log('[MTF] 启动多周期共振策略 / Starting Multi-Timeframe strategy...\n');
    await engine.runStrategy('MultiTimeframe', {
      // 交易对 / Trading pair
      symbols: ['BTC/USDT'],

      // 基础时间周期 (5分钟K线，内部聚合为15M和1H)
      // Base timeframe (5min candles, internally aggregated to 15M and 1H)
      timeframe: '5m',

      // ============================================
      // 1H 大周期参数 (趋势判断)
      // 1H Major Timeframe Parameters (Trend Detection)
      // ============================================
      h1ShortPeriod: 10,      // 短期均线 / Short MA period
      h1LongPeriod: 30,       // 长期均线 / Long MA period

      // ============================================
      // 15M 中周期参数 (回调判断)
      // 15M Medium Timeframe Parameters (Pullback Detection)
      // ============================================
      m15RsiPeriod: 14,           // RSI 周期 / RSI period
      m15RsiPullbackLong: 40,     // 多头回调阈值 / Long pullback threshold
      m15RsiPullbackShort: 60,    // 空头回调阈值 / Short pullback threshold
      m15PullbackPercent: 1.5,    // 价格回撤阈值 % / Price pullback threshold %

      // ============================================
      // 5M 小周期参数 (进场触发)
      // 5M Minor Timeframe Parameters (Entry Trigger)
      // ============================================
      m5RsiPeriod: 14,            // RSI 周期 / RSI period
      m5RsiOversold: 30,          // RSI 超卖阈值 / RSI oversold
      m5RsiOverbought: 70,        // RSI 超买阈值 / RSI overbought
      m5ShortPeriod: 5,           // 短期均线 / Short MA
      m5LongPeriod: 15,           // 长期均线 / Long MA

      // ============================================
      // 出场参数 / Exit Parameters
      // ============================================
      takeProfitPercent: 3.0,     // 止盈 3% / Take profit 3%
      stopLossPercent: 1.5,       // 止损 1.5% / Stop loss 1.5%
      useTrendExit: true,         // 趋势反转出场 / Exit on trend reversal

      // ============================================
      // 仓位参数 / Position Parameters
      // ============================================
      positionPercent: 95,        // 仓位比例 / Position percentage
    });

    // 获取状态 / Get status
    const status = engine.getStatus();
    console.log('\n[MTF] 引擎状态 / Engine status:');
    console.log(JSON.stringify(status, null, 2));

    // 保持运行 / Keep running
    console.log('\n[MTF] 策略运行中，按 Ctrl+C 停止 / Strategy running, press Ctrl+C to stop');
    console.log('[MTF] 入场条件 / Entry conditions:');
    console.log('      多头 / Long: 1H趋势向上 + 15M回调到位 + 5M触发');
    console.log('      空头 / Short: 1H趋势向下 + 15M反弹到位 + 5M触发\n');

  } catch (error) {
    console.error('[MTF] 启动失败 / Start failed:', error);
    process.exit(1);
  }

  // 优雅退出 / Graceful shutdown
  const shutdown = async () => {
    console.log('\n[MTF] 正在停止 / Stopping...');
    await engine.stop();
    console.log('[MTF] 已停止 / Stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// 运行主函数 / Run main function
main().catch(console.error);
