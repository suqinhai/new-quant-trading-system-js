/**
 * 回测运行器
 * Backtest Runner
 *
 * 命令行工具，用于运行回测并生成报告
 * CLI tool for running backtests and generating reports
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config'; // 加载模块 dotenv/config

// 导入文件系统 / Import file system
import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path
import { fileURLToPath } from 'url'; // 导入模块 url

// 导入回测引擎 / Import backtest engine
import { BacktestEngine } from './BacktestEngine.js'; // 导入模块 ./BacktestEngine.js

// 获取当前文件目录 / Get current file directory
const __filename = fileURLToPath(import.meta.url); // 定义常量 __filename
const __dirname = path.dirname(__filename); // 定义常量 __dirname

/**
 * 回测运行器类
 * Backtest Runner Class
 */
class BacktestRunner { // 定义类 BacktestRunner
  /**
   * 构造函数
   * @param {Object} options - 运行选项 / Run options
   */
  constructor(options = {}) { // 构造函数
    // 数据目录 / Data directory
    this.dataDir = options.dataDir || process.env.BACKTEST_DATA_PATH || './data/historical'; // 设置 dataDir

    // 结果输出目录 / Results output directory
    this.outputDir = options.outputDir || './backtest-results'; // 设置 outputDir

    // 确保输出目录存在 / Ensure output directory exists
    this._ensureDir(this.outputDir); // 调用 _ensureDir
  } // 结束代码块

  /**
   * 运行回测
   * Run backtest
   * @param {Object} config - 回测配置 / Backtest configuration
   * @returns {Promise<Object>} 回测结果 / Backtest result
   */
  async run(config) { // 执行语句
    console.log('======================================'); // 控制台输出
    console.log('开始回测 / Starting Backtest'); // 控制台输出
    console.log('======================================\n'); // 控制台输出

    // 解析配置 / Parse configuration
    const { // 解构赋值
      strategy,           // 策略实例或路径 / Strategy instance or path
      symbol,             // 交易对 / Trading pair
      timeframe,          // 时间周期 / Timeframe
      startDate,          // 起始日期 / Start date
      endDate,            // 结束日期 / End date
      initialCapital,     // 初始资金 / Initial capital
      commissionRate,     // 手续费率 / Commission rate
      slippage,           // 滑点 / Slippage
    } = config; // 执行语句

    // 加载数据 / Load data
    console.log(`正在加载数据 / Loading data: ${symbol} ${timeframe}`); // 控制台输出
    const data = await this._loadData(symbol, timeframe, startDate, endDate); // 定义常量 data

    // 创建回测引擎 / Create backtest engine
    const engine = new BacktestEngine({ // 定义常量 engine
      initialCapital: initialCapital || parseFloat(process.env.BACKTEST_INITIAL_CAPITAL) || 10000, // 初始资金
      commissionRate: commissionRate || 0.001, // 手续费频率
      slippage: slippage || 0.0005, // 滑点
    }); // 结束代码块

    // 加载策略 / Load strategy
    let strategyInstance; // 定义变量 strategyInstance
    if (typeof strategy === 'string') { // 条件判断 typeof strategy === 'string'
      // 如果是路径，动态导入 / If path, dynamic import
      const strategyModule = await import(path.resolve(strategy)); // 定义常量 strategyModule
      strategyInstance = new strategyModule.default(); // 赋值 strategyInstance
    } else if (typeof strategy === 'function') { // 执行语句
      // 如果是类，实例化 / If class, instantiate
      strategyInstance = new strategy(); // 赋值 strategyInstance
    } else { // 执行语句
      // 如果是实例，直接使用 / If instance, use directly
      strategyInstance = strategy; // 赋值 strategyInstance
    } // 结束代码块

    // 设置数据和策略 / Set data and strategy
    engine.loadData(data); // 调用 engine.loadData
    engine.setStrategy(strategyInstance); // 调用 engine.setStrategy

    // 绑定进度事件 / Bind progress event
    engine.on('progress', ({ current, total, percent }) => { // 注册事件监听
      process.stdout.write(`\r回测进度 / Progress: ${percent}% (${current}/${total})`); // 调用 process.stdout.write
    }); // 结束代码块

    // 绑定订单事件 / Bind order event
    engine.on('order', (order) => { // 注册事件监听
      // 可以在这里记录订单日志 / Can log orders here
    }); // 结束代码块

    // 运行回测 / Run backtest
    console.log('\n开始执行策略 / Executing strategy...\n'); // 控制台输出
    const startTime = Date.now(); // 定义常量 startTime
    const result = await engine.run(); // 定义常量 result
    const duration = ((Date.now() - startTime) / 1000).toFixed(2); // 定义常量 duration

    // 输出结果 / Output results
    this._printResults(result, duration); // 调用 _printResults

    // 保存结果 / Save results
    const resultPath = await this._saveResults(result, config); // 定义常量 resultPath
    console.log(`\n结果已保存到 / Results saved to: ${resultPath}`); // 控制台输出

    return result; // 返回结果
  } // 结束代码块

  /**
   * 加载历史数据
   * Load historical data
   * @private
   */
  async _loadData(symbol, timeframe, startDate, endDate) { // 执行语句
    // 构建文件路径 / Build file path
    const safeSymbol = symbol.replace('/', '_'); // 定义常量 safeSymbol
    const fileName = `${safeSymbol}_${timeframe}.json`; // 定义常量 fileName
    const filePath = path.join(this.dataDir, fileName); // 定义常量 filePath

    // 检查文件是否存在 / Check if file exists
    if (!fs.existsSync(filePath)) { // 条件判断 !fs.existsSync(filePath)
      throw new Error(`数据文件不存在 / Data file not found: ${filePath}\n请先运行数据下载脚本 / Please run data download script first`); // 抛出异常
    } // 结束代码块

    // 读取数据 / Read data
    const rawData = fs.readFileSync(filePath, 'utf-8'); // 定义常量 rawData
    let data = JSON.parse(rawData); // 定义变量 data

    // 按日期筛选 / Filter by date
    if (startDate) { // 条件判断 startDate
      const startTs = new Date(startDate).getTime(); // 定义常量 startTs
      data = data.filter(candle => candle.timestamp >= startTs); // 赋值 data
    } // 结束代码块
    if (endDate) { // 条件判断 endDate
      const endTs = new Date(endDate).getTime(); // 定义常量 endTs
      data = data.filter(candle => candle.timestamp <= endTs); // 赋值 data
    } // 结束代码块

    console.log(`已加载 ${data.length} 条数据 / Loaded ${data.length} candles`); // 控制台输出
    console.log(`时间范围 / Time range: ${new Date(data[0].timestamp).toISOString()} - ${new Date(data[data.length - 1].timestamp).toISOString()}`); // 控制台输出

    return data; // 返回结果
  } // 结束代码块

  /**
   * 打印结果
   * Print results
   * @private
   */
  _printResults(result, duration) { // 调用 _printResults
    console.log('\n======================================'); // 控制台输出
    console.log('回测结果 / Backtest Results'); // 控制台输出
    console.log('======================================\n'); // 控制台输出

    console.log('账户统计 / Account Statistics:'); // 控制台输出
    console.log(`  初始资金 / Initial Capital: $${result.initialCapital.toFixed(2)}`); // 控制台输出
    console.log(`  最终权益 / Final Equity: $${result.finalEquity.toFixed(2)}`); // 控制台输出
    console.log(`  总收益 / Total Return: ${result.totalReturn.toFixed(2)}%`); // 控制台输出
    console.log(`  收益额 / Return Amount: $${result.totalReturnAmount.toFixed(2)}`); // 控制台输出

    console.log('\n交易统计 / Trade Statistics:'); // 控制台输出
    console.log(`  总交易次数 / Total Trades: ${result.totalTrades}`); // 控制台输出
    console.log(`  盈利次数 / Winning Trades: ${result.winningTrades}`); // 控制台输出
    console.log(`  亏损次数 / Losing Trades: ${result.losingTrades}`); // 控制台输出
    console.log(`  胜率 / Win Rate: ${result.winRate.toFixed(2)}%`); // 控制台输出

    console.log('\n盈亏分析 / PnL Analysis:'); // 控制台输出
    console.log(`  总盈利 / Total Profit: $${result.totalProfit.toFixed(2)}`); // 控制台输出
    console.log(`  总亏损 / Total Loss: $${result.totalLoss.toFixed(2)}`); // 控制台输出
    console.log(`  盈亏比 / Profit Factor: ${result.profitFactor.toFixed(2)}`); // 控制台输出
    console.log(`  平均盈利 / Avg Win: $${result.avgWin.toFixed(2)}`); // 控制台输出
    console.log(`  平均亏损 / Avg Loss: $${result.avgLoss.toFixed(2)}`); // 控制台输出

    console.log('\n风险指标 / Risk Metrics:'); // 控制台输出
    console.log(`  最大回撤 / Max Drawdown: $${result.maxDrawdown.toFixed(2)}`); // 控制台输出
    console.log(`  最大回撤% / Max Drawdown%: ${result.maxDrawdownPercent.toFixed(2)}%`); // 控制台输出
    console.log(`  夏普比率 / Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`); // 控制台输出

    console.log(`\n回测耗时 / Duration: ${duration}s`); // 控制台输出
    console.log('======================================\n'); // 控制台输出
  } // 结束代码块

  /**
   * 保存结果
   * Save results
   * @private
   */
  async _saveResults(result, config) { // 执行语句
    // 生成文件名 / Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 定义常量 timestamp
    const strategyName = config.strategy?.name || 'unknown'; // 定义常量 strategyName
    const fileName = `backtest_${strategyName}_${timestamp}.json`; // 定义常量 fileName
    const filePath = path.join(this.outputDir, fileName); // 定义常量 filePath

    // 构建保存数据 / Build save data
    const saveData = { // 定义常量 saveData
      config: { // 配置
        symbol: config.symbol, // 交易对
        timeframe: config.timeframe, // 周期
        startDate: config.startDate, // 启动Date
        endDate: config.endDate, // endDate
        initialCapital: config.initialCapital, // 初始资金
      }, // 结束代码块
      summary: { // summary
        initialCapital: result.initialCapital, // 初始资金
        finalEquity: result.finalEquity, // finalEquity
        totalReturn: result.totalReturn, // 总Return
        totalTrades: result.totalTrades, // 总成交
        winRate: result.winRate, // win频率
        profitFactor: result.profitFactor, // 盈利Factor
        maxDrawdownPercent: result.maxDrawdownPercent, // 最大回撤百分比
        sharpeRatio: result.sharpeRatio, // sharpe比例
      }, // 结束代码块
      trades: result.trades, // 成交
      equityCurve: result.equityCurve, // equityCurve
      timestamp: new Date().toISOString(), // 时间戳
    }; // 结束代码块

    // 写入文件 / Write file
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2)); // 调用 fs.writeFileSync

    return filePath; // 返回结果
  } // 结束代码块

  /**
   * 确保目录存在
   * Ensure directory exists
   * @private
   */
  _ensureDir(dir) { // 调用 _ensureDir
    if (!fs.existsSync(dir)) { // 条件判断 !fs.existsSync(dir)
      fs.mkdirSync(dir, { recursive: true }); // 调用 fs.mkdirSync
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主入口 / Main Entry
// ============================================

// 如果直接运行此脚本 / If running this script directly
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]; // 定义常量 isMainModule

if (isMainModule) { // 条件判断 isMainModule
  // 解析命令行参数 / Parse command line arguments
  const args = process.argv.slice(2); // 定义常量 args

  // 显示帮助信息 / Show help
  if (args.includes('--help') || args.includes('-h')) { // 条件判断 args.includes('--help') || args.includes('-h')
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
    `); // 执行语句
    process.exit(0); // 退出进程
  } // 结束代码块

  // 解析参数 / Parse arguments
  const getArg = (names) => { // 定义函数 getArg
    for (const name of names) { // 循环 const name of names
      const index = args.indexOf(name); // 定义常量 index
      if (index !== -1 && args[index + 1]) { // 条件判断 index !== -1 && args[index + 1]
        return args[index + 1]; // 返回结果
      } // 结束代码块
    } // 结束代码块
    return null; // 返回结果
  }; // 结束代码块

  // 配置 / Configuration
  const config = { // 定义常量 config
    strategy: getArg(['--strategy', '-s']), // 策略
    symbol: getArg(['--symbol']) || 'BTC/USDT', // 交易对
    timeframe: getArg(['--timeframe']) || '1h', // 周期
    startDate: getArg(['--start']) || process.env.BACKTEST_START_DATE, // 启动Date
    endDate: getArg(['--end']) || process.env.BACKTEST_END_DATE, // endDate
    initialCapital: parseFloat(getArg(['--capital'])) || parseFloat(process.env.BACKTEST_INITIAL_CAPITAL) || 10000, // 初始资金
  }; // 结束代码块

  // 验证必要参数 / Validate required parameters
  if (!config.strategy) { // 条件判断 !config.strategy
    console.error('错误: 请指定策略文件 / Error: Please specify strategy file'); // 控制台输出
    console.error('使用 --help 查看帮助 / Use --help for help'); // 控制台输出
    process.exit(1); // 退出进程
  } // 结束代码块

  // 运行回测 / Run backtest
  const runner = new BacktestRunner(); // 定义常量 runner
  runner.run(config).catch(error => { // 调用 runner.run
    console.error('回测失败 / Backtest failed:', error.message); // 控制台输出
    process.exit(1); // 退出进程
  }); // 结束代码块
} // 结束代码块

// 导出类 / Export class
export { BacktestRunner }; // 导出命名成员
export default BacktestRunner; // 默认导出
