#!/usr/bin/env node

/**
 * 历史数据下载脚本
 * Historical Data Download Script
 *
 * 从交易所下载历史K线数据并保存到本地
 * Downloads historical candlestick data from exchanges and saves locally
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入文件系统模块 / Import file system module
import fs from 'fs';
import path from 'path';

// 导入命令行参数解析 / Import command line argument parser
import { program } from 'commander';

// 导入交易所工厂 / Import exchange factory
import { ExchangeFactory } from '../src/exchange/index.js';

// 导入辅助函数 / Import helper functions
import { formatDate, sleep } from '../src/utils/helpers.js';

// ============================================
// 命令行参数配置 / Command Line Argument Configuration
// ============================================

program
  .name('download-data')
  .description('下载历史K线数据 / Download historical candlestick data')
  .version('1.0.0')
  .requiredOption('-s, --symbol <symbol>', '交易对 (如 BTC/USDT) / Trading pair')
  .option('-e, --exchange <exchange>', '交易所 / Exchange', 'binance')
  .option('-t, --timeframe <timeframe>', '时间周期 / Timeframe', '1h')
  .option('--start <date>', '开始日期 (YYYY-MM-DD) / Start date', getDefaultStartDate())
  .option('--end <date>', '结束日期 (YYYY-MM-DD) / End date', getDefaultEndDate())
  .option('-o, --output <dir>', '输出目录 / Output directory', 'data/historical')
  .option('--format <format>', '输出格式 (json|csv) / Output format', 'json')
  .option('--limit <number>', '每次请求的K线数量 / Candles per request', '1000')
  .parse();

// 获取命令行参数 / Get command line arguments
const options = program.opts();

/**
 * 获取默认开始日期 (30天前)
 * Get default start date (30 days ago)
 * @returns {string} 日期字符串 / Date string
 */
function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return formatDate(date, 'YYYY-MM-DD');
}

/**
 * 获取默认结束日期 (今天)
 * Get default end date (today)
 * @returns {string} 日期字符串 / Date string
 */
function getDefaultEndDate() {
  return formatDate(new Date(), 'YYYY-MM-DD');
}

/**
 * 解析日期字符串为时间戳
 * Parse date string to timestamp
 * @param {string} dateStr - 日期字符串 / Date string
 * @returns {number} 时间戳 / Timestamp
 */
function parseDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`无效的日期格式: ${dateStr} / Invalid date format`);
  }
  return date.getTime();
}

/**
 * 确保目录存在
 * Ensure directory exists
 * @param {string} dir - 目录路径 / Directory path
 */
function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ 创建目录 / Created directory: ${dir}`);
  }
}

/**
 * 将K线数据转换为CSV格式
 * Convert candlestick data to CSV format
 * @param {Array} candles - K线数据 / Candlestick data
 * @returns {string} CSV 字符串 / CSV string
 */
function toCsv(candles) {
  // CSV 头部 / CSV header
  const header = 'timestamp,datetime,open,high,low,close,volume';

  // 转换每根K线 / Convert each candle
  const rows = candles.map(candle => {
    const [timestamp, open, high, low, close, volume] = candle;
    const datetime = formatDate(timestamp, 'YYYY-MM-DD HH:mm:ss');
    return `${timestamp},${datetime},${open},${high},${low},${close},${volume}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * 保存数据到文件
 * Save data to file
 * @param {Array} candles - K线数据 / Candlestick data
 * @param {string} filePath - 文件路径 / File path
 * @param {string} format - 格式 (json|csv) / Format
 */
function saveData(candles, filePath, format) {
  // 根据格式保存 / Save based on format
  if (format === 'csv') {
    const csv = toCsv(candles);
    fs.writeFileSync(filePath, csv, 'utf-8');
  } else {
    // 转换为对象格式 / Convert to object format
    const data = candles.map(candle => ({
      timestamp: candle[0],
      datetime: formatDate(candle[0], 'YYYY-MM-DD HH:mm:ss'),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
    }));

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  console.log(`✓ 数据已保存 / Data saved: ${filePath}`);
}

/**
 * 下载历史数据
 * Download historical data
 */
async function downloadData() {
  console.log('================================================');
  console.log('       历史数据下载器 / Historical Data Downloader');
  console.log('================================================\n');

  // 显示参数 / Display parameters
  console.log('参数 / Parameters:');
  console.log(`  交易所 / Exchange: ${options.exchange}`);
  console.log(`  交易对 / Symbol: ${options.symbol}`);
  console.log(`  时间周期 / Timeframe: ${options.timeframe}`);
  console.log(`  开始日期 / Start: ${options.start}`);
  console.log(`  结束日期 / End: ${options.end}`);
  console.log(`  输出格式 / Format: ${options.format}`);
  console.log(`  输出目录 / Output: ${options.output}`);
  console.log('');

  try {
    // 创建交易所实例 / Create exchange instance
    console.log('→ 连接交易所 / Connecting to exchange...');
    const exchange = ExchangeFactory.create(options.exchange, {
      // 下载历史数据不需要 API 密钥 / No API key needed for downloading
      enableRateLimit: true,
    });

    // 加载市场信息 / Load market info
    await exchange.loadMarkets();
    console.log('✓ 交易所连接成功 / Exchange connected\n');

    // 验证交易对 / Validate symbol
    if (!exchange.markets[options.symbol]) {
      throw new Error(`交易对不存在: ${options.symbol} / Symbol not found`);
    }

    // 解析日期 / Parse dates
    const startTime = parseDate(options.start);
    const endTime = parseDate(options.end);
    const limit = parseInt(options.limit, 10);

    // 计算时间间隔 / Calculate time interval
    const timeframeMs = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };

    const intervalMs = timeframeMs[options.timeframe] || 60 * 60 * 1000;

    // 收集所有K线 / Collect all candles
    const allCandles = [];
    let currentTime = startTime;
    let requestCount = 0;

    console.log('→ 开始下载数据 / Starting data download...\n');

    // 循环下载 / Loop to download
    while (currentTime < endTime) {
      // 下载一批数据 / Download a batch
      const candles = await exchange.fetchOHLCV(
        options.symbol,
        options.timeframe,
        currentTime,
        limit
      );

      // 如果没有数据，退出 / If no data, exit
      if (!candles || candles.length === 0) {
        console.log('  没有更多数据 / No more data');
        break;
      }

      // 过滤超出范围的数据 / Filter data out of range
      const filteredCandles = candles.filter(c => c[0] >= startTime && c[0] <= endTime);

      // 添加到总数据 / Add to total
      allCandles.push(...filteredCandles);

      // 更新当前时间 / Update current time
      const lastTimestamp = candles[candles.length - 1][0];
      currentTime = lastTimestamp + intervalMs;

      // 显示进度 / Show progress
      requestCount++;
      const progress = Math.min(100, ((currentTime - startTime) / (endTime - startTime)) * 100);
      console.log(`  请求 ${requestCount}: 获取 ${filteredCandles.length} 根K线, 进度: ${progress.toFixed(1)}%`);

      // 限速等待 / Rate limit wait
      await sleep(500);
    }

    // 去重并排序 / Deduplicate and sort
    const uniqueCandles = [];
    const seen = new Set();

    for (const candle of allCandles) {
      const key = candle[0].toString();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCandles.push(candle);
      }
    }

    // 按时间排序 / Sort by time
    uniqueCandles.sort((a, b) => a[0] - b[0]);

    console.log(`\n✓ 下载完成 / Download complete: ${uniqueCandles.length} 根K线 / candles\n`);

    // 确保输出目录存在 / Ensure output directory exists
    ensureDirectory(options.output);

    // 生成文件名 / Generate filename
    const safeSymbol = options.symbol.replace('/', '-');
    const extension = options.format === 'csv' ? 'csv' : 'json';
    const filename = `${safeSymbol}_${options.timeframe}_${options.start}_${options.end}.${extension}`;
    const filePath = path.join(options.output, filename);

    // 保存数据 / Save data
    saveData(uniqueCandles, filePath, options.format);

    // 显示统计 / Show statistics
    console.log('\n================================================');
    console.log('                 下载统计 / Statistics');
    console.log('================================================');
    console.log(`  总K线数 / Total candles: ${uniqueCandles.length}`);
    console.log(`  请求次数 / Requests: ${requestCount}`);
    console.log(`  时间范围 / Time range:`);
    console.log(`    开始 / Start: ${formatDate(uniqueCandles[0][0], 'YYYY-MM-DD HH:mm:ss')}`);
    console.log(`    结束 / End: ${formatDate(uniqueCandles[uniqueCandles.length - 1][0], 'YYYY-MM-DD HH:mm:ss')}`);
    console.log(`  文件大小 / File size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
    console.log('================================================\n');

    // 关闭交易所连接 / Close exchange connection
    if (exchange.close) {
      await exchange.close();
    }

    console.log('✓ 任务完成 / Task completed!\n');

  } catch (error) {
    console.error('\n✗ 下载失败 / Download failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行下载 / Run download
downloadData();
