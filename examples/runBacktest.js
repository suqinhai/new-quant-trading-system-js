/**
 * 示例：运行回测
 * Example: Run Backtest
 *
 * 展示如何使用回测引擎测试策略
 * Demonstrates how to use backtest engine to test strategies
 */

// 导入回测引擎 / Import backtest engine
import { BacktestEngine } from '../src/backtest/index.js';

// 导入策略 / Import strategy
import { SMAStrategy } from '../src/strategies/index.js';

// 导入辅助函数 / Import helper functions
import { formatDate, formatCurrency, formatPercent } from '../src/utils/index.js';

/**
 * 生成模拟数据
 * Generate mock data
 * @param {number} count - 数据数量 / Data count
 * @returns {Object[]} K线数据 / Candle data
 */
function generateMockData(count = 500) {
  const data = [];
  let price = 50000;  // 起始价格 / Starting price

  // 开始时间 / Start time
  const startTime = Date.now() - count * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // 随机价格变动 / Random price movement
    const change = (Math.random() - 0.48) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.random() * 1000 + 100;

    data.push({
      timestamp: startTime + i * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return data;
}

/**
 * 主函数
 * Main function
 */
async function main() {
  console.log('================================================');
  console.log('       回测示例 / Backtest Example');
  console.log('================================================\n');

  // 创建策略 / Create strategy
  const strategy = new SMAStrategy({
    fastPeriod: 10,
    slowPeriod: 20,
    symbols: ['BTC/USDT'],
    timeframe: '1h',
  });

  // 创建回测引擎 / Create backtest engine
  const backtest = new BacktestEngine({
    initialCapital: 10000,  // 初始资金 10000 USDT / Initial capital
    commission: 0.001,      // 手续费 0.1% / Commission
    slippage: 0.0005,       // 滑点 0.05% / Slippage
  });

  // 设置策略 / Set strategy
  backtest.setStrategy(strategy);

  // 生成模拟数据 / Generate mock data
  console.log('[Backtest] 生成模拟数据 / Generating mock data...');
  const data = generateMockData(500);
  console.log(`[Backtest] 生成 ${data.length} 根K线 / Generated ${data.length} candles\n`);

  // 加载数据 / Load data
  backtest.loadData('BTC/USDT', data);

  // 运行回测 / Run backtest
  console.log('[Backtest] 开始回测 / Starting backtest...\n');
  const results = await backtest.run();

  // 显示结果 / Display results
  console.log('================================================');
  console.log('             回测结果 / Backtest Results');
  console.log('================================================\n');

  console.log('基本信息 / Basic Info:');
  console.log(`  策略 / Strategy: SMA 双均线 / Dual Moving Average`);
  console.log(`  交易对 / Symbol: BTC/USDT`);
  console.log(`  时间范围 / Period: ${formatDate(data[0].timestamp)} - ${formatDate(data[data.length - 1].timestamp)}`);
  console.log(`  K线数量 / Candles: ${data.length}`);
  console.log('');

  console.log('资金统计 / Capital Statistics:');
  console.log(`  初始资金 / Initial: ${formatCurrency(results.initialCapital)}`);
  console.log(`  最终资金 / Final: ${formatCurrency(results.finalCapital)}`);
  console.log(`  总收益 / Total Return: ${formatCurrency(results.totalReturn)}`);
  console.log(`  收益率 / Return Rate: ${formatPercent(results.returnRate)}`);
  console.log('');

  console.log('交易统计 / Trade Statistics:');
  console.log(`  总交易数 / Total Trades: ${results.totalTrades}`);
  console.log(`  盈利交易 / Winning: ${results.winningTrades}`);
  console.log(`  亏损交易 / Losing: ${results.losingTrades}`);
  console.log(`  胜率 / Win Rate: ${formatPercent(results.winRate)}`);
  console.log('');

  console.log('风险指标 / Risk Metrics:');
  console.log(`  最大回撤 / Max Drawdown: ${formatPercent(results.maxDrawdown)}`);
  console.log(`  夏普比率 / Sharpe Ratio: ${results.sharpeRatio?.toFixed(2) || 'N/A'}`);
  console.log(`  平均盈利 / Avg Win: ${formatCurrency(results.avgWin || 0)}`);
  console.log(`  平均亏损 / Avg Loss: ${formatCurrency(results.avgLoss || 0)}`);
  console.log(`  盈亏比 / Profit Factor: ${results.profitFactor?.toFixed(2) || 'N/A'}`);
  console.log('');

  console.log('================================================');
  console.log('         回测完成 / Backtest Complete');
  console.log('================================================\n');

  // 显示交易记录 / Show trade history
  if (results.trades && results.trades.length > 0) {
    console.log('最近交易记录 / Recent Trades:');
    console.log('-'.repeat(80));

    const recentTrades = results.trades.slice(-5);
    for (const trade of recentTrades) {
      console.log(`  ${formatDate(trade.timestamp)} | ${trade.side.toUpperCase().padEnd(4)} | ` +
        `${trade.amount.toFixed(6)} @ ${formatCurrency(trade.price)} | ` +
        `PnL: ${formatCurrency(trade.pnl || 0)}`);
    }

    console.log('-'.repeat(80));
    console.log(`  共 ${results.trades.length} 笔交易 / Total ${results.trades.length} trades\n`);
  }
}

// 运行主函数 / Run main function
main().catch(console.error);
