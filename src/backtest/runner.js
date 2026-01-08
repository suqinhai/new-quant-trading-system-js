/**
 * 回测运行器
 * Backtest Runner
 *
 * 命令行工具，用于运行回测并生成报告
 * CLI tool for running backtests and generating reports
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入文件系统 / Import file system
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入回测引擎 / Import backtest engine
import { BacktestEngine } from './BacktestEngine.js';

// 获取当前文件目录 / Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 回测运行器类
 * Backtest Runner Class
 */
class BacktestRunner {
  /**
   * 构造函数
   * @param {Object} options - 运行选项 / Run options
   */
  constructor(options = {}) {
    // 数据目录 / Data directory
    this.dataDir = options.dataDir || process.env.BACKTEST_DATA_PATH || './data/historical';

    // 结果输出目录 / Results output directory
    this.outputDir = options.outputDir || './backtest-results';

    // 确保输出目录存在 / Ensure output directory exists
    this._ensureDir(this.outputDir);
  }

  /**
   * 运行回测
   * Run backtest
   * @param {Object} config - 回测配置 / Backtest configuration
   * @returns {Promise<Object>} 回测结果 / Backtest result
   */
  async run(config) {
    console.log('======================================');
    console.log('开始回测 / Starting Backtest');
    console.log('======================================\n');

    // 解析配置 / Parse configuration
    const {
      strategy,           // 策略实例或路径 / Strategy instance or path
      symbol,             // 交易对 / Trading pair
      timeframe,          // 时间周期 / Timeframe
      startDate,          // 起始日期 / Start date
      endDate,            // 结束日期 / End date
      initialCapital,     // 初始资金 / Initial capital
      commissionRate,     // 手续费率 / Commission rate
      slippage,           // 滑点 / Slippage
    } = config;

    // 加载数据 / Load data
    console.log(`正在加载数据 / Loading data: ${symbol} ${timeframe}`);
    const data = await this._loadData(symbol, timeframe, startDate, endDate);

    // 创建回测引擎 / Create backtest engine
    const engine = new BacktestEngine({
      initialCapital: initialCapital || parseFloat(process.env.BACKTEST_INITIAL_CAPITAL) || 10000,
      commissionRate: commissionRate || 0.001,
      slippage: slippage || 0.0005,
    });

    // 加载策略 / Load strategy
    let strategyInstance;
    if (typeof strategy === 'string') {
      // 如果是路径，动态导入 / If path, dynamic import
      const strategyModule = await import(path.resolve(strategy));
      strategyInstance = new strategyModule.default();
    } else if (typeof strategy === 'function') {
      // 如果是类，实例化 / If class, instantiate
      strategyInstance = new strategy();
    } else {
      // 如果是实例，直接使用 / If instance, use directly
      strategyInstance = strategy;
    }

    // 设置数据和策略 / Set data and strategy
    engine.loadData(data);
    engine.setStrategy(strategyInstance);

    // 绑定进度事件 / Bind progress event
    engine.on('progress', ({ current, total, percent }) => {
      process.stdout.write(`\r回测进度 / Progress: ${percent}% (${current}/${total})`);
    });

    // 绑定订单事件 / Bind order event
    engine.on('order', (order) => {
      // 可以在这里记录订单日志 / Can log orders here
    });

    // 运行回测 / Run backtest
    console.log('\n开始执行策略 / Executing strategy...\n');
    const startTime = Date.now();
    const result = await engine.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 输出结果 / Output results
    this._printResults(result, duration);

    // 保存结果 / Save results
    const resultPath = await this._saveResults(result, config);
    console.log(`\n结果已保存到 / Results saved to: ${resultPath}`);

    return result;
  }

  /**
   * 加载历史数据
   * Load historical data
   * @private
   */
  async _loadData(symbol, timeframe, startDate, endDate) {
    // 构建文件路径 / Build file path
    const safeSymbol = symbol.replace('/', '_');
    const fileName = `${safeSymbol}_${timeframe}.json`;
    const filePath = path.join(this.dataDir, fileName);

    // 检查文件是否存在 / Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`数据文件不存在 / Data file not found: ${filePath}\n请先运行数据下载脚本 / Please run data download script first`);
    }

    // 读取数据 / Read data
    const rawData = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(rawData);

    // 按日期筛选 / Filter by date
    if (startDate) {
      const startTs = new Date(startDate).getTime();
      data = data.filter(candle => candle.timestamp >= startTs);
    }
    if (endDate) {
      const endTs = new Date(endDate).getTime();
      data = data.filter(candle => candle.timestamp <= endTs);
    }

    console.log(`已加载 ${data.length} 条数据 / Loaded ${data.length} candles`);
    console.log(`时间范围 / Time range: ${new Date(data[0].timestamp).toISOString()} - ${new Date(data[data.length - 1].timestamp).toISOString()}`);

    return data;
  }

  /**
   * 打印结果
   * Print results
   * @private
   */
  _printResults(result, duration) {
    console.log('\n======================================');
    console.log('回测结果 / Backtest Results');
    console.log('======================================\n');

    console.log('账户统计 / Account Statistics:');
    console.log(`  初始资金 / Initial Capital: $${result.initialCapital.toFixed(2)}`);
    console.log(`  最终权益 / Final Equity: $${result.finalEquity.toFixed(2)}`);
    console.log(`  总收益 / Total Return: ${result.totalReturn.toFixed(2)}%`);
    console.log(`  收益额 / Return Amount: $${result.totalReturnAmount.toFixed(2)}`);

    console.log('\n交易统计 / Trade Statistics:');
    console.log(`  总交易次数 / Total Trades: ${result.totalTrades}`);
    console.log(`  盈利次数 / Winning Trades: ${result.winningTrades}`);
    console.log(`  亏损次数 / Losing Trades: ${result.losingTrades}`);
    console.log(`  胜率 / Win Rate: ${result.winRate.toFixed(2)}%`);

    console.log('\n盈亏分析 / PnL Analysis:');
    console.log(`  总盈利 / Total Profit: $${result.totalProfit.toFixed(2)}`);
    console.log(`  总亏损 / Total Loss: $${result.totalLoss.toFixed(2)}`);
    console.log(`  盈亏比 / Profit Factor: ${result.profitFactor.toFixed(2)}`);
    console.log(`  平均盈利 / Avg Win: $${result.avgWin.toFixed(2)}`);
    console.log(`  平均亏损 / Avg Loss: $${result.avgLoss.toFixed(2)}`);

    console.log('\n风险指标 / Risk Metrics:');
    console.log(`  最大回撤 / Max Drawdown: $${result.maxDrawdown.toFixed(2)}`);
    console.log(`  最大回撤% / Max Drawdown%: ${result.maxDrawdownPercent.toFixed(2)}%`);
    console.log(`  夏普比率 / Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);

    console.log(`\n回测耗时 / Duration: ${duration}s`);
    console.log('======================================\n');
  }

  /**
   * 保存结果
   * Save results
   * @private
   */
  async _saveResults(result, config) {
    // 生成文件名 / Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const strategyName = config.strategy?.name || 'unknown';
    const fileName = `backtest_${strategyName}_${timestamp}.json`;
    const filePath = path.join(this.outputDir, fileName);

    // 构建保存数据 / Build save data
    const saveData = {
      config: {
        symbol: config.symbol,
        timeframe: config.timeframe,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: config.initialCapital,
      },
      summary: {
        initialCapital: result.initialCapital,
        finalEquity: result.finalEquity,
        totalReturn: result.totalReturn,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        maxDrawdownPercent: result.maxDrawdownPercent,
        sharpeRatio: result.sharpeRatio,
      },
      trades: result.trades,
      equityCurve: result.equityCurve,
      timestamp: new Date().toISOString(),
    };

    // 写入文件 / Write file
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));

    return filePath;
  }

  /**
   * 确保目录存在
   * Ensure directory exists
   * @private
   */
  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================
// 主入口 / Main Entry
// ============================================

// 如果直接运行此脚本 / If running this script directly
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  // 解析命令行参数 / Parse command line arguments
  const args = process.argv.slice(2);

  // 显示帮助信息 / Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
用法 / Usage:
  node src/backtest/runner.js [options]

选项 / Options:
  --strategy, -s    策略文件路径 / Strategy file path
  --symbol          交易对 / Trading pair (default: BTC/USDT)
  --timeframe       时间周期 / Timeframe (default: 1h)
  --start           起始日期 / Start date (default: from env)
  --end             结束日期 / End date (default: from env)
  --capital         初始资金 / Initial capital (default: 10000)
  --help, -h        显示帮助 / Show help

示例 / Example:
  node src/backtest/runner.js -s ./src/strategies/SMAStrategy.js --symbol BTC/USDT --timeframe 1h
    `);
    process.exit(0);
  }

  // 解析参数 / Parse arguments
  const getArg = (names) => {
    for (const name of names) {
      const index = args.indexOf(name);
      if (index !== -1 && args[index + 1]) {
        return args[index + 1];
      }
    }
    return null;
  };

  // 配置 / Configuration
  const config = {
    strategy: getArg(['--strategy', '-s']),
    symbol: getArg(['--symbol']) || 'BTC/USDT:USDT',
    timeframe: getArg(['--timeframe']) || '1h',
    startDate: getArg(['--start']) || process.env.BACKTEST_START_DATE,
    endDate: getArg(['--end']) || process.env.BACKTEST_END_DATE,
    initialCapital: parseFloat(getArg(['--capital'])) || parseFloat(process.env.BACKTEST_INITIAL_CAPITAL) || 10000,
  };

  // 验证必要参数 / Validate required parameters
  if (!config.strategy) {
    console.error('错误: 请指定策略文件 / Error: Please specify strategy file');
    console.error('使用 --help 查看帮助 / Use --help for help');
    process.exit(1);
  }

  // 运行回测 / Run backtest
  const runner = new BacktestRunner();
  runner.run(config).catch(error => {
    console.error('回测失败 / Backtest failed:', error.message);
    process.exit(1);
  });
}

// 导出类 / Export class
export { BacktestRunner };
export default BacktestRunner;
