#!/usr/bin/env node

/**
 * 历史数据下载脚本
 * Historical Data Download Script
 *
 * 功能 / Features:
 * 1. 使用 CCXT 下载 Binance/Bybit/OKX 历史数据 / Download historical data from Binance/Bybit/OKX using CCXT
 * 2. 支持 1分钟K线、资金费率、持仓量、标记价格 / Support 1m OHLCV, funding rate, open interest, mark price
 * 3. 自动建表、批量插入 ClickHouse / Auto create tables, batch insert to ClickHouse
 * 4. 支持增量更新 / Support incremental updates
 *
 * 使用方法 / Usage:
 *   node download-history.js --exchange binance --symbol BTC/USDT:USDT --type ohlcv
 *   node download-history.js --exchange all --symbol BTC/USDT:USDT --type all
 *   node download-history.js --config config.json
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入 CCXT 库用于交易所 API 调用 / Import CCXT for exchange API calls
import ccxt from 'ccxt';

// 导入 ClickHouse 客户端 / Import ClickHouse client
import { createClient } from '@clickhouse/client';

// 导入命令行参数解析 / Import command line argument parser
import { parseArgs } from 'node:util';

// 导入文件系统模块 / Import file system module
import fs from 'fs';

// 导入路径模块 / Import path module
import path from 'path';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 支持的交易所列表
 * Supported exchanges list
 */
const SUPPORTED_EXCHANGES = ['binance', 'bybit', 'okx'];

/**
 * 支持的数据类型
 * Supported data types
 */
const DATA_TYPES = {
  OHLCV: 'ohlcv',                 // K线数据 / Candlestick data
  FUNDING_RATE: 'funding_rate',   // 资金费率 / Funding rate
  OPEN_INTEREST: 'open_interest', // 持仓量 / Open interest
  MARK_PRICE: 'mark_price',       // 标记价格 / Mark price
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ClickHouse 连接配置 / ClickHouse connection config
  clickhouse: {
    host: 'http://localhost:8123',  // ClickHouse 主机地址 / ClickHouse host
    database: 'quant',               // 数据库名称 / Database name
    username: 'default',             // 用户名 / Username
    password: '',                    // 密码 / Password
  },
  // 下载配置 / Download config
  download: {
    startDate: '2020-01-01',         // 起始日期 / Start date
    endDate: null,                   // 结束日期 (null = 今天) / End date (null = today)
    batchSize: 1000,                 // 每批插入数量 / Batch insert size
    rateLimit: 100,                  // 请求间隔毫秒 / Request interval ms
    maxRetries: 3,                   // 最大重试次数 / Max retry count
  },
  // 默认交易对列表 / Default symbol list
  symbols: [
    'BTC/USDT:USDT',                 // 比特币永续合约 / BTC perpetual
    'ETH/USDT:USDT',                 // 以太坊永续合约 / ETH perpetual
  ],
};

/**
 * ClickHouse 建表语句模板
 * ClickHouse table creation templates
 */
const TABLE_SCHEMAS = {
  // K线数据表 / OHLCV table
  ohlcv: `
    CREATE TABLE IF NOT EXISTS {database}.ohlcv_{exchange}
    (
      symbol LowCardinality(String),     -- 交易对 / Trading pair
      timestamp DateTime64(3),            -- 时间戳 (毫秒精度) / Timestamp (ms precision)
      open Float64,                       -- 开盘价 / Open price
      high Float64,                       -- 最高价 / High price
      low Float64,                        -- 最低价 / Low price
      close Float64,                      -- 收盘价 / Close price
      volume Float64,                     -- 成交量 / Volume
      quote_volume Float64,               -- 成交额 / Quote volume
      trades_count UInt32,                -- 成交笔数 / Trade count
      created_at DateTime DEFAULT now()   -- 插入时间 / Insert time
    )
    ENGINE = ReplacingMergeTree(created_at)
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (symbol, timestamp)
    SETTINGS index_granularity = 8192
  `,

  // 资金费率表 / Funding rate table
  funding_rate: `
    CREATE TABLE IF NOT EXISTS {database}.funding_rate_{exchange}
    (
      symbol LowCardinality(String),     -- 交易对 / Trading pair
      timestamp DateTime64(3),            -- 资金费率时间 / Funding time
      funding_rate Float64,               -- 资金费率 / Funding rate
      funding_time DateTime64(3),         -- 下次资金费率时间 / Next funding time
      mark_price Float64,                 -- 标记价格 / Mark price
      index_price Float64,                -- 指数价格 / Index price
      created_at DateTime DEFAULT now()   -- 插入时间 / Insert time
    )
    ENGINE = ReplacingMergeTree(created_at)
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (symbol, timestamp)
    SETTINGS index_granularity = 8192
  `,

  // 持仓量表 / Open interest table
  open_interest: `
    CREATE TABLE IF NOT EXISTS {database}.open_interest_{exchange}
    (
      symbol LowCardinality(String),     -- 交易对 / Trading pair
      timestamp DateTime64(3),            -- 时间戳 / Timestamp
      open_interest Float64,              -- 持仓量 (合约数量) / Open interest (contracts)
      open_interest_value Float64,        -- 持仓价值 (USDT) / Open interest value (USDT)
      created_at DateTime DEFAULT now()   -- 插入时间 / Insert time
    )
    ENGINE = ReplacingMergeTree(created_at)
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (symbol, timestamp)
    SETTINGS index_granularity = 8192
  `,

  // 标记价格表 / Mark price table
  mark_price: `
    CREATE TABLE IF NOT EXISTS {database}.mark_price_{exchange}
    (
      symbol LowCardinality(String),     -- 交易对 / Trading pair
      timestamp DateTime64(3),            -- 时间戳 / Timestamp
      mark_price Float64,                 -- 标记价格 / Mark price
      index_price Float64,                -- 指数价格 / Index price
      estimated_settle_price Float64,     -- 预估结算价 / Estimated settle price
      created_at DateTime DEFAULT now()   -- 插入时间 / Insert time
    )
    ENGINE = ReplacingMergeTree(created_at)
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (symbol, timestamp)
    SETTINGS index_granularity = 8192
  `,
};

// ============================================
// 工具函数 / Utility Functions
// ============================================

/**
 * 延迟函数
 * Delay function
 *
 * @param {number} ms - 延迟毫秒数 / Delay in milliseconds
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 解析日期字符串为时间戳
 * Parse date string to timestamp
 *
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD) / Date string
 * @returns {number} 时间戳毫秒 / Timestamp in milliseconds
 */
const parseDate = (dateStr) => {
  // 如果是空，返回当前时间 / If null, return current time
  if (!dateStr) {
    return Date.now();
  }

  // 解析日期字符串 / Parse date string
  const date = new Date(dateStr);

  // 验证日期有效性 / Validate date
  if (isNaN(date.getTime())) {
    throw new Error(`无效的日期格式 / Invalid date format: ${dateStr}`);
  }

  // 返回时间戳 / Return timestamp
  return date.getTime();
};

/**
 * 格式化时间戳为可读字符串
 * Format timestamp to readable string
 *
 * @param {number} timestamp - 时间戳毫秒 / Timestamp in milliseconds
 * @returns {string} 格式化的日期时间 / Formatted datetime
 */
const formatTimestamp = (timestamp) => {
  // 创建日期对象 / Create date object
  const date = new Date(timestamp);

  // 返回 ISO 格式字符串 / Return ISO format string
  return date.toISOString().replace('T', ' ').substring(0, 19);
};

/**
 * 将交易对转换为 ClickHouse 安全的格式
 * Convert symbol to ClickHouse safe format
 *
 * @param {string} symbol - 原始交易对 / Original symbol
 * @returns {string} 安全的交易对 / Safe symbol
 */
const safeSymbol = (symbol) => {
  // 将 / 和 : 替换为下划线 / Replace / and : with underscore
  return symbol.replace(/[/:]/g, '_');
};

/**
 * 打印进度条
 * Print progress bar
 *
 * @param {number} current - 当前进度 / Current progress
 * @param {number} total - 总数 / Total count
 * @param {string} prefix - 前缀文本 / Prefix text
 */
const printProgress = (current, total, prefix = '') => {
  // 计算进度百分比 / Calculate progress percentage
  const percent = Math.floor((current / total) * 100);

  // 计算进度条长度 / Calculate progress bar length
  const barLength = 30;

  // 计算已完成长度 / Calculate filled length
  const filled = Math.floor(barLength * current / total);

  // 构建进度条 / Build progress bar
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  // 打印进度 / Print progress
  process.stdout.write(`\r${prefix} [${bar}] ${percent}% (${current}/${total})`);

  // 如果完成，换行 / If complete, add newline
  if (current >= total) {
    console.log();
  }
};

// ============================================
// ClickHouse 客户端类 / ClickHouse Client Class
// ============================================

/**
 * ClickHouse 数据库客户端
 * ClickHouse Database Client
 */
class ClickHouseClient {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - ClickHouse 配置 / ClickHouse config
   */
  constructor(config) {
    // 保存配置 / Save config
    this.config = config;

    // 创建 ClickHouse 客户端实例 / Create ClickHouse client instance
    this.client = createClient({
      host: config.host,           // 主机地址 / Host address
      database: config.database,   // 数据库名 / Database name
      username: config.username,   // 用户名 / Username
      password: config.password,   // 密码 / Password
    });

    // 日志前缀 / Log prefix
    this.logPrefix = '[ClickHouse]';
  }

  /**
   * 初始化数据库和表
   * Initialize database and tables
   *
   * @param {string[]} exchanges - 交易所列表 / Exchange list
   * @param {string[]} dataTypes - 数据类型列表 / Data type list
   */
  async initialize(exchanges, dataTypes) {
    console.log(`${this.logPrefix} 正在初始化数据库... / Initializing database...`);

    // 1. 创建数据库 / Create database
    await this._createDatabase();

    // 2. 为每个交易所和数据类型创建表 / Create tables for each exchange and data type
    for (const exchange of exchanges) {
      for (const dataType of dataTypes) {
        // 创建表 / Create table
        await this._createTable(exchange, dataType);
      }
    }

    console.log(`${this.logPrefix} 数据库初始化完成 / Database initialized`);
  }

  /**
   * 创建数据库
   * Create database
   * @private
   */
  async _createDatabase() {
    // 构建建库语句 / Build create database statement
    const sql = `CREATE DATABASE IF NOT EXISTS ${this.config.database}`;

    // 执行建库语句 / Execute create database statement
    await this.client.command({ query: sql });

    console.log(`${this.logPrefix} 数据库已创建/确认: ${this.config.database}`);
  }

  /**
   * 创建数据表
   * Create data table
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} dataType - 数据类型 / Data type
   * @private
   */
  async _createTable(exchange, dataType) {
    // 获取表结构模板 / Get table schema template
    const schemaTemplate = TABLE_SCHEMAS[dataType];

    // 如果没有对应的表结构，跳过 / If no schema, skip
    if (!schemaTemplate) {
      console.warn(`${this.logPrefix} 未知的数据类型: ${dataType}`);
      return;
    }

    // 替换占位符 / Replace placeholders
    const sql = schemaTemplate
      .replace(/{database}/g, this.config.database)
      .replace(/{exchange}/g, exchange);

    // 执行建表语句 / Execute create table statement
    await this.client.command({ query: sql });

    // 获取表名 / Get table name
    const tableName = `${dataType}_${exchange}`;

    console.log(`${this.logPrefix} 表已创建/确认: ${this.config.database}.${tableName}`);
  }

  /**
   * 获取最新的数据时间戳 (用于增量更新)
   * Get latest data timestamp (for incremental update)
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} dataType - 数据类型 / Data type
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<number|null>} 最新时间戳或 null / Latest timestamp or null
   */
  async getLatestTimestamp(exchange, dataType, symbol) {
    // 构建表名 / Build table name
    const tableName = `${this.config.database}.${dataType}_${exchange}`;

    // 构建查询语句 / Build query statement
    const sql = `
      SELECT max(timestamp) as latest
      FROM ${tableName}
      WHERE symbol = {symbol:String}
    `;

    try {
      // 执行查询 / Execute query
      const result = await this.client.query({
        query: sql,
        query_params: { symbol },
        format: 'JSONEachRow',
      });

      // 获取结果 / Get result
      const rows = await result.json();

      // 如果有结果且不为空 / If has result and not empty
      if (rows.length > 0 && rows[0].latest) {
        // 解析时间戳 / Parse timestamp
        const timestamp = new Date(rows[0].latest).getTime();

        console.log(`${this.logPrefix} ${symbol} 最新数据时间: ${formatTimestamp(timestamp)}`);

        // 返回时间戳 / Return timestamp
        return timestamp;
      }

      // 没有数据，返回 null / No data, return null
      return null;

    } catch (error) {
      // 表可能不存在，返回 null / Table may not exist, return null
      console.log(`${this.logPrefix} 获取最新时间戳失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量插入 OHLCV 数据
   * Batch insert OHLCV data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} data - OHLCV 数据数组 / OHLCV data array
   */
  async insertOHLCV(exchange, symbol, data) {
    // 如果没有数据，直接返回 / If no data, return
    if (!data || data.length === 0) {
      return;
    }

    // 构建表名 / Build table name
    const tableName = `${this.config.database}.ohlcv_${exchange}`;

    // 转换数据格式 / Convert data format
    const rows = data.map(candle => ({
      symbol,                                        // 交易对 / Trading pair
      timestamp: new Date(candle[0]),                // 时间戳 / Timestamp
      open: candle[1],                               // 开盘价 / Open
      high: candle[2],                               // 最高价 / High
      low: candle[3],                                // 最低价 / Low
      close: candle[4],                              // 收盘价 / Close
      volume: candle[5] || 0,                        // 成交量 / Volume
      quote_volume: candle[6] || 0,                  // 成交额 / Quote volume
      trades_count: candle[7] || 0,                  // 成交笔数 / Trade count
    }));

    // 执行批量插入 / Execute batch insert
    await this.client.insert({
      table: tableName,
      values: rows,
      format: 'JSONEachRow',
    });
  }

  /**
   * 批量插入资金费率数据
   * Batch insert funding rate data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} data - 资金费率数据数组 / Funding rate data array
   */
  async insertFundingRate(exchange, symbol, data) {
    // 如果没有数据，直接返回 / If no data, return
    if (!data || data.length === 0) {
      return;
    }

    // 构建表名 / Build table name
    const tableName = `${this.config.database}.funding_rate_${exchange}`;

    // 转换数据格式 / Convert data format
    const rows = data.map(item => ({
      symbol,                                                // 交易对 / Trading pair
      timestamp: new Date(item.timestamp),                   // 时间戳 / Timestamp
      funding_rate: item.fundingRate || 0,                   // 资金费率 / Funding rate
      funding_time: new Date(item.fundingTimestamp || item.timestamp),  // 资金费率时间 / Funding time
      mark_price: item.markPrice || 0,                       // 标记价格 / Mark price
      index_price: item.indexPrice || 0,                     // 指数价格 / Index price
    }));

    // 执行批量插入 / Execute batch insert
    await this.client.insert({
      table: tableName,
      values: rows,
      format: 'JSONEachRow',
    });
  }

  /**
   * 批量插入持仓量数据
   * Batch insert open interest data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} data - 持仓量数据数组 / Open interest data array
   */
  async insertOpenInterest(exchange, symbol, data) {
    // 如果没有数据，直接返回 / If no data, return
    if (!data || data.length === 0) {
      return;
    }

    // 构建表名 / Build table name
    const tableName = `${this.config.database}.open_interest_${exchange}`;

    // 转换数据格式 / Convert data format
    const rows = data.map(item => ({
      symbol,                                                // 交易对 / Trading pair
      timestamp: new Date(item.timestamp),                   // 时间戳 / Timestamp
      open_interest: item.openInterest || item.openInterestAmount || 0,  // 持仓量 / Open interest
      open_interest_value: item.openInterestValue || 0,      // 持仓价值 / OI value
    }));

    // 执行批量插入 / Execute batch insert
    await this.client.insert({
      table: tableName,
      values: rows,
      format: 'JSONEachRow',
    });
  }

  /**
   * 批量插入标记价格数据
   * Batch insert mark price data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} data - 标记价格数据数组 / Mark price data array
   */
  async insertMarkPrice(exchange, symbol, data) {
    // 如果没有数据，直接返回 / If no data, return
    if (!data || data.length === 0) {
      return;
    }

    // 构建表名 / Build table name
    const tableName = `${this.config.database}.mark_price_${exchange}`;

    // 转换数据格式 / Convert data format
    const rows = data.map(item => ({
      symbol,                                                // 交易对 / Trading pair
      timestamp: new Date(item.timestamp),                   // 时间戳 / Timestamp
      mark_price: item.markPrice || 0,                       // 标记价格 / Mark price
      index_price: item.indexPrice || 0,                     // 指数价格 / Index price
      estimated_settle_price: item.estimatedSettlePrice || 0, // 预估结算价 / Est. settle price
    }));

    // 执行批量插入 / Execute batch insert
    await this.client.insert({
      table: tableName,
      values: rows,
      format: 'JSONEachRow',
    });
  }

  /**
   * 关闭连接
   * Close connection
   */
  async close() {
    // 关闭 ClickHouse 客户端连接 / Close ClickHouse client connection
    await this.client.close();

    console.log(`${this.logPrefix} 连接已关闭 / Connection closed`);
  }
}

// ============================================
// 数据下载器类 / Data Downloader Class
// ============================================

/**
 * 历史数据下载器
 * Historical Data Downloader
 */
class HistoricalDataDownloader {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    // 合并配置 / Merge config
    this.config = {
      clickhouse: { ...DEFAULT_CONFIG.clickhouse, ...config.clickhouse },
      download: { ...DEFAULT_CONFIG.download, ...config.download },
      symbols: config.symbols || DEFAULT_CONFIG.symbols,
    };

    // 创建 ClickHouse 客户端 / Create ClickHouse client
    this.clickhouse = new ClickHouseClient(this.config.clickhouse);

    // 交易所实例缓存 / Exchange instance cache
    this.exchanges = new Map();

    // 日志前缀 / Log prefix
    this.logPrefix = '[Downloader]';

    // 统计信息 / Statistics
    this.stats = {
      totalRecords: 0,      // 总记录数 / Total records
      totalRequests: 0,     // 总请求数 / Total requests
      errors: 0,            // 错误数 / Error count
      startTime: null,      // 开始时间 / Start time
    };
  }

  /**
   * 获取或创建交易所实例
   * Get or create exchange instance
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @returns {ccxt.Exchange} CCXT 交易所实例 / CCXT exchange instance
   */
  _getExchange(exchangeName) {
    // 如果已缓存，直接返回 / If cached, return directly
    if (this.exchanges.has(exchangeName)) {
      return this.exchanges.get(exchangeName);
    }

    // 根据交易所名称创建实例 / Create instance based on exchange name
    let exchange;

    switch (exchangeName) {
      case 'binance':
        // 创建 Binance 期货实例 / Create Binance futures instance
        exchange = new ccxt.binance({
          enableRateLimit: true,           // 启用速率限制 / Enable rate limit
          options: {
            defaultType: 'swap',           // 默认为永续合约 / Default to perpetual
            adjustForTimeDifference: true, // 调整时间差 / Adjust time difference
          },
        });
        break;

      case 'bybit':
        // 创建 Bybit 实例 / Create Bybit instance
        exchange = new ccxt.bybit({
          enableRateLimit: true,           // 启用速率限制 / Enable rate limit
          options: {
            defaultType: 'swap',           // 默认为永续合约 / Default to perpetual
          },
        });
        break;

      case 'okx':
        // 创建 OKX 实例 / Create OKX instance
        exchange = new ccxt.okx({
          enableRateLimit: true,           // 启用速率限制 / Enable rate limit
          options: {
            defaultType: 'swap',           // 默认为永续合约 / Default to perpetual
          },
        });
        break;

      default:
        // 不支持的交易所 / Unsupported exchange
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchangeName}`);
    }

    // 缓存实例 / Cache instance
    this.exchanges.set(exchangeName, exchange);

    // 返回实例 / Return instance
    return exchange;
  }

  /**
   * 初始化下载器
   * Initialize downloader
   *
   * @param {string[]} exchanges - 交易所列表 / Exchange list
   * @param {string[]} dataTypes - 数据类型列表 / Data type list
   */
  async initialize(exchanges, dataTypes) {
    console.log(`${this.logPrefix} 正在初始化下载器... / Initializing downloader...`);

    // 记录开始时间 / Record start time
    this.stats.startTime = Date.now();

    // 初始化 ClickHouse (创建数据库和表) / Initialize ClickHouse (create DB and tables)
    await this.clickhouse.initialize(exchanges, dataTypes);

    // 加载交易所市场信息 / Load exchange market info
    for (const exchangeName of exchanges) {
      // 获取交易所实例 / Get exchange instance
      const exchange = this._getExchange(exchangeName);

      console.log(`${this.logPrefix} 加载 ${exchangeName} 市场信息... / Loading ${exchangeName} markets...`);

      // 加载市场信息 / Load markets
      await exchange.loadMarkets();

      console.log(`${this.logPrefix} ${exchangeName} 市场加载完成，共 ${Object.keys(exchange.markets).length} 个交易对`);
    }

    console.log(`${this.logPrefix} 下载器初始化完成 / Downloader initialized`);
  }

  /**
   * 下载 OHLCV (K线) 数据
   * Download OHLCV (candlestick) data
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   */
  async downloadOHLCV(exchangeName, symbol, startTime, endTime) {
    console.log(`\n${this.logPrefix} 开始下载 ${exchangeName} ${symbol} K线数据...`);
    console.log(`${this.logPrefix} 时间范围: ${formatTimestamp(startTime)} ~ ${formatTimestamp(endTime)}`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange(exchangeName);

    // 检查交易所是否支持 fetchOHLCV / Check if exchange supports fetchOHLCV
    if (!exchange.has['fetchOHLCV']) {
      console.error(`${this.logPrefix} ${exchangeName} 不支持 fetchOHLCV`);
      return;
    }

    // 检查增量更新 / Check for incremental update
    const latestTimestamp = await this.clickhouse.getLatestTimestamp(
      exchangeName,
      DATA_TYPES.OHLCV,
      symbol
    );

    // 如果有历史数据，从最新时间开始 / If has history, start from latest time
    if (latestTimestamp && latestTimestamp > startTime) {
      // 增加 1 分钟以避免重复 / Add 1 minute to avoid duplicates
      startTime = latestTimestamp + 60000;
      console.log(`${this.logPrefix} 增量更新模式，从 ${formatTimestamp(startTime)} 开始`);
    }

    // 如果开始时间已经超过结束时间，无需下载 / If start > end, no need to download
    if (startTime >= endTime) {
      console.log(`${this.logPrefix} 数据已是最新，无需下载`);
      return;
    }

    // 当前请求时间 / Current request time
    let currentTime = startTime;

    // 每次请求的数据量 / Data per request
    const limit = 1000;

    // 时间间隔 (1分钟 = 60000ms) / Time interval (1 minute)
    const interval = 60000;

    // 总批次数 (估算) / Total batches (estimated)
    const totalBatches = Math.ceil((endTime - startTime) / (interval * limit));

    // 当前批次 / Current batch
    let batchCount = 0;

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 循环下载数据 / Loop to download data
    while (currentTime < endTime) {
      try {
        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取 K线数据 / Fetch OHLCV data
        const ohlcv = await exchange.fetchOHLCV(
          symbol,        // 交易对 / Symbol
          '1m',          // 时间周期 / Timeframe
          currentTime,   // 起始时间 / Since
          limit          // 数量限制 / Limit
        );

        // 如果没有数据，说明已经到达最新 / If no data, reached latest
        if (!ohlcv || ohlcv.length === 0) {
          console.log(`\n${this.logPrefix} 已到达数据末尾`);
          break;
        }

        // 添加到缓冲区 / Add to buffer
        buffer.push(...ohlcv);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += ohlcv.length;

        // 更新当前时间为最后一条数据的时间 + 1分钟 / Update current time
        currentTime = ohlcv[ohlcv.length - 1][0] + interval;

        // 增加批次计数 / Increment batch count
        batchCount++;

        // 打印进度 / Print progress
        printProgress(batchCount, totalBatches, `${this.logPrefix} ${symbol}`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          // 批量插入 / Batch insert
          await this.clickhouse.insertOHLCV(exchangeName, symbol, buffer);

          // 清空缓冲区 / Clear buffer
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        // 记录错误 / Log error
        console.error(`\n${this.logPrefix} 下载出错: ${error.message}`);

        // 增加错误计数 / Increment error count
        this.stats.errors++;

        // 如果是速率限制错误，等待更长时间 / If rate limit error, wait longer
        if (error.message.includes('rate') || error.message.includes('limit')) {
          console.log(`${this.logPrefix} 触发速率限制，等待 30 秒...`);
          await sleep(30000);
        } else {
          // 其他错误，等待短时间后重试 / Other errors, wait briefly and retry
          await sleep(5000);
        }
      }
    }

    // 插入剩余的缓冲数据 / Insert remaining buffer data
    if (buffer.length > 0) {
      await this.clickhouse.insertOHLCV(exchangeName, symbol, buffer);
    }

    console.log(`\n${this.logPrefix} ${symbol} K线下载完成`);
  }

  /**
   * 下载资金费率数据
   * Download funding rate data
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   */
  async downloadFundingRate(exchangeName, symbol, startTime, endTime) {
    console.log(`\n${this.logPrefix} 开始下载 ${exchangeName} ${symbol} 资金费率...`);
    console.log(`${this.logPrefix} 时间范围: ${formatTimestamp(startTime)} ~ ${formatTimestamp(endTime)}`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange(exchangeName);

    // 检查交易所是否支持 fetchFundingRateHistory / Check if supported
    if (!exchange.has['fetchFundingRateHistory']) {
      console.warn(`${this.logPrefix} ${exchangeName} 不支持 fetchFundingRateHistory，尝试其他方法...`);

      // 尝试使用 fetchFundingHistory 或其他方法 / Try alternative methods
      await this._downloadFundingRateAlternative(exchangeName, symbol, startTime, endTime);
      return;
    }

    // 检查增量更新 / Check for incremental update
    const latestTimestamp = await this.clickhouse.getLatestTimestamp(
      exchangeName,
      DATA_TYPES.FUNDING_RATE,
      symbol
    );

    // 如果有历史数据，从最新时间开始 / If has history, start from latest time
    if (latestTimestamp && latestTimestamp > startTime) {
      startTime = latestTimestamp + 1;
      console.log(`${this.logPrefix} 增量更新模式，从 ${formatTimestamp(startTime)} 开始`);
    }

    // 当前请求时间 / Current request time
    let currentTime = startTime;

    // 每次请求的数据量 / Data per request
    const limit = 1000;

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 循环下载数据 / Loop to download data
    while (currentTime < endTime) {
      try {
        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取资金费率历史 / Fetch funding rate history
        const fundingRates = await exchange.fetchFundingRateHistory(
          symbol,        // 交易对 / Symbol
          currentTime,   // 起始时间 / Since
          limit          // 数量限制 / Limit
        );

        // 如果没有数据，说明已经到达最新 / If no data, reached latest
        if (!fundingRates || fundingRates.length === 0) {
          console.log(`${this.logPrefix} 已到达资金费率数据末尾`);
          break;
        }

        // 添加到缓冲区 / Add to buffer
        buffer.push(...fundingRates);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += fundingRates.length;

        // 更新当前时间为最后一条数据的时间 + 1ms / Update current time
        currentTime = fundingRates[fundingRates.length - 1].timestamp + 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条资金费率记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          // 批量插入 / Batch insert
          await this.clickhouse.insertFundingRate(exchangeName, symbol, buffer);

          // 清空缓冲区 / Clear buffer
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        // 记录错误 / Log error
        console.error(`${this.logPrefix} 下载资金费率出错: ${error.message}`);

        // 增加错误计数 / Increment error count
        this.stats.errors++;

        // 等待后重试 / Wait and retry
        await sleep(5000);
      }
    }

    // 插入剩余的缓冲数据 / Insert remaining buffer data
    if (buffer.length > 0) {
      await this.clickhouse.insertFundingRate(exchangeName, symbol, buffer);
    }

    console.log(`${this.logPrefix} ${symbol} 资金费率下载完成`);
  }

  /**
   * 使用替代方法下载资金费率 (针对不支持 fetchFundingRateHistory 的交易所)
   * Download funding rate using alternative method
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadFundingRateAlternative(exchangeName, symbol, startTime, endTime) {
    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange(exchangeName);

    try {
      // 尝试获取当前资金费率 / Try to fetch current funding rate
      if (exchange.has['fetchFundingRate']) {
        // 获取当前资金费率 / Fetch current funding rate
        const fundingRate = await exchange.fetchFundingRate(symbol);

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 如果获取成功，插入数据库 / If successful, insert to DB
        if (fundingRate) {
          await this.clickhouse.insertFundingRate(exchangeName, symbol, [fundingRate]);
          this.stats.totalRecords++;
          console.log(`${this.logPrefix} 已获取当前资金费率: ${fundingRate.fundingRate}`);
        }
      }

      // 尝试使用交易所特定 API / Try exchange-specific API
      if (exchangeName === 'binance') {
        // Binance 特定的资金费率历史 API / Binance-specific funding rate history API
        await this._downloadBinanceFundingRateHistory(symbol, startTime, endTime);
      } else if (exchangeName === 'bybit') {
        // Bybit 特定的资金费率历史 API / Bybit-specific funding rate history API
        await this._downloadBybitFundingRateHistory(symbol, startTime, endTime);
      } else if (exchangeName === 'okx') {
        // OKX 特定的资金费率历史 API / OKX-specific funding rate history API
        await this._downloadOKXFundingRateHistory(symbol, startTime, endTime);
      }

    } catch (error) {
      // 记录错误 / Log error
      console.error(`${this.logPrefix} 替代方法下载资金费率失败: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * 下载 Binance 资金费率历史 (使用原生 API)
   * Download Binance funding rate history (using native API)
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadBinanceFundingRateHistory(symbol, startTime, endTime) {
    console.log(`${this.logPrefix} 使用 Binance 原生 API 下载资金费率...`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('binance');

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 当前时间 / Current time
    let currentTime = startTime;

    // 循环获取数据 / Loop to fetch data
    while (currentTime < endTime) {
      try {
        // 调用 Binance 期货 API / Call Binance futures API
        const response = await exchange.fapiPublicGetFundingRate({
          symbol: symbol.replace('/', '').replace(':USDT', ''),  // 转换格式 / Convert format
          startTime: currentTime,
          endTime: Math.min(currentTime + 30 * 24 * 60 * 60 * 1000, endTime),  // 最多 30 天 / Max 30 days
          limit: 1000,
        });

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 如果没有数据，跳出循环 / If no data, break
        if (!response || response.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const fundingRates = response.map(item => ({
          timestamp: parseInt(item.fundingTime),
          fundingRate: parseFloat(item.fundingRate),
          fundingTimestamp: parseInt(item.fundingTime),
          markPrice: parseFloat(item.markPrice || 0),
        }));

        // 添加到缓冲区 / Add to buffer
        buffer.push(...fundingRates);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += fundingRates.length;

        // 更新当前时间 / Update current time
        currentTime = parseInt(response[response.length - 1].fundingTime) + 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 Binance 资金费率记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertFundingRate('binance', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} Binance 资金费率下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertFundingRate('binance', symbol, buffer);
    }
  }

  /**
   * 下载 Bybit 资金费率历史 (使用原生 API)
   * Download Bybit funding rate history (using native API)
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadBybitFundingRateHistory(symbol, startTime, endTime) {
    console.log(`${this.logPrefix} 使用 Bybit 原生 API 下载资金费率...`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('bybit');

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 当前时间 / Current time
    let currentTime = startTime;

    // 循环获取数据 / Loop to fetch data
    while (currentTime < endTime) {
      try {
        // 调用 Bybit V5 API / Call Bybit V5 API
        const response = await exchange.publicGetV5MarketFundingHistory({
          category: 'linear',
          symbol: symbol.replace('/', '').replace(':USDT', ''),  // 转换格式 / Convert format
          startTime: currentTime,
          endTime: Math.min(currentTime + 30 * 24 * 60 * 60 * 1000, endTime),
          limit: 200,
        });

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取结果列表 / Get result list
        const list = response.result?.list || [];

        // 如果没有数据，跳出循环 / If no data, break
        if (list.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const fundingRates = list.map(item => ({
          timestamp: parseInt(item.fundingRateTimestamp),
          fundingRate: parseFloat(item.fundingRate),
          fundingTimestamp: parseInt(item.fundingRateTimestamp),
        }));

        // 添加到缓冲区 / Add to buffer
        buffer.push(...fundingRates);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += fundingRates.length;

        // 更新当前时间 / Update current time
        currentTime = parseInt(list[list.length - 1].fundingRateTimestamp) + 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 Bybit 资金费率记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertFundingRate('bybit', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} Bybit 资金费率下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertFundingRate('bybit', symbol, buffer);
    }
  }

  /**
   * 下载 OKX 资金费率历史 (使用原生 API)
   * Download OKX funding rate history (using native API)
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadOKXFundingRateHistory(symbol, startTime, endTime) {
    console.log(`${this.logPrefix} 使用 OKX 原生 API 下载资金费率...`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('okx');

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // OKX instId 格式: BTC-USDT-SWAP / OKX instId format
    const instId = symbol.replace('/', '-').replace(':USDT', '') + '-SWAP';

    // 当前时间 (OKX 需要从后往前获取) / Current time (OKX needs to fetch backwards)
    let beforeTime = endTime;

    // 循环获取数据 / Loop to fetch data
    while (beforeTime > startTime) {
      try {
        // 调用 OKX API / Call OKX API
        const response = await exchange.publicGetPublicFundingRateHistory({
          instId,
          before: beforeTime,
          limit: 100,
        });

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取数据列表 / Get data list
        const data = response.data || [];

        // 如果没有数据，跳出循环 / If no data, break
        if (data.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const fundingRates = data.map(item => ({
          timestamp: parseInt(item.fundingTime),
          fundingRate: parseFloat(item.fundingRate),
          fundingTimestamp: parseInt(item.fundingTime),
        }));

        // 过滤掉早于 startTime 的数据 / Filter out data before startTime
        const filteredRates = fundingRates.filter(r => r.timestamp >= startTime);

        // 添加到缓冲区 / Add to buffer
        buffer.push(...filteredRates);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += filteredRates.length;

        // 更新 beforeTime 为最早一条数据的时间 / Update beforeTime
        beforeTime = parseInt(data[data.length - 1].fundingTime) - 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 OKX 资金费率记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertFundingRate('okx', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} OKX 资金费率下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertFundingRate('okx', symbol, buffer);
    }
  }

  /**
   * 下载持仓量数据
   * Download open interest data
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   */
  async downloadOpenInterest(exchangeName, symbol, startTime, endTime) {
    console.log(`\n${this.logPrefix} 开始下载 ${exchangeName} ${symbol} 持仓量...`);
    console.log(`${this.logPrefix} 时间范围: ${formatTimestamp(startTime)} ~ ${formatTimestamp(endTime)}`);

    // 根据交易所选择不同的下载方法 / Choose download method based on exchange
    switch (exchangeName) {
      case 'binance':
        await this._downloadBinanceOpenInterest(symbol, startTime, endTime);
        break;

      case 'bybit':
        await this._downloadBybitOpenInterest(symbol, startTime, endTime);
        break;

      case 'okx':
        await this._downloadOKXOpenInterest(symbol, startTime, endTime);
        break;

      default:
        console.warn(`${this.logPrefix} ${exchangeName} 持仓量下载暂不支持`);
    }
  }

  /**
   * 下载 Binance 持仓量历史
   * Download Binance open interest history
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadBinanceOpenInterest(symbol, startTime, endTime) {
    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('binance');

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 当前时间 / Current time
    let currentTime = startTime;

    // 循环获取数据 / Loop to fetch data
    while (currentTime < endTime) {
      try {
        // 调用 Binance API 获取历史持仓量 / Call Binance API for OI history
        const response = await exchange.fapiPublicGetOpenInterestHist({
          symbol: symbol.replace('/', '').replace(':USDT', ''),
          period: '5m',  // 5分钟间隔 / 5 minute interval
          startTime: currentTime,
          endTime: Math.min(currentTime + 7 * 24 * 60 * 60 * 1000, endTime),  // 最多 7 天 / Max 7 days
          limit: 500,
        });

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 如果没有数据，跳出循环 / If no data, break
        if (!response || response.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const openInterestData = response.map(item => ({
          timestamp: parseInt(item.timestamp),
          openInterest: parseFloat(item.sumOpenInterest),
          openInterestValue: parseFloat(item.sumOpenInterestValue),
        }));

        // 添加到缓冲区 / Add to buffer
        buffer.push(...openInterestData);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += openInterestData.length;

        // 更新当前时间 / Update current time
        currentTime = parseInt(response[response.length - 1].timestamp) + 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 Binance 持仓量记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertOpenInterest('binance', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} Binance 持仓量下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertOpenInterest('binance', symbol, buffer);
    }
  }

  /**
   * 下载 Bybit 持仓量历史
   * Download Bybit open interest history
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadBybitOpenInterest(symbol, startTime, endTime) {
    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('bybit');

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 当前游标 / Current cursor
    let cursor = '';

    // 循环获取数据 / Loop to fetch data
    while (true) {
      try {
        // 构建请求参数 / Build request params
        const params = {
          category: 'linear',
          symbol: symbol.replace('/', '').replace(':USDT', ''),
          intervalTime: '5min',
          startTime,
          endTime,
          limit: 200,
        };

        // 如果有游标，添加到参数 / If has cursor, add to params
        if (cursor) {
          params.cursor = cursor;
        }

        // 调用 Bybit API / Call Bybit API
        const response = await exchange.publicGetV5MarketOpenInterest(params);

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取结果 / Get result
        const list = response.result?.list || [];

        // 如果没有数据，跳出循环 / If no data, break
        if (list.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const openInterestData = list.map(item => ({
          timestamp: parseInt(item.timestamp),
          openInterest: parseFloat(item.openInterest),
          openInterestValue: 0,  // Bybit 不提供价值 / Bybit doesn't provide value
        }));

        // 添加到缓冲区 / Add to buffer
        buffer.push(...openInterestData);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += openInterestData.length;

        // 获取下一页游标 / Get next page cursor
        cursor = response.result?.nextPageCursor || '';

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 Bybit 持仓量记录`);

        // 如果没有下一页，跳出循环 / If no next page, break
        if (!cursor) {
          break;
        }

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertOpenInterest('bybit', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} Bybit 持仓量下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
        break;
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertOpenInterest('bybit', symbol, buffer);
    }
  }

  /**
   * 下载 OKX 持仓量历史
   * Download OKX open interest history
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @private
   */
  async _downloadOKXOpenInterest(symbol, startTime, endTime) {
    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange('okx');

    // OKX instId 格式 / OKX instId format
    const instId = symbol.replace('/', '-').replace(':USDT', '') + '-SWAP';

    // 数据缓冲区 / Data buffer
    let buffer = [];

    // 当前时间 (OKX 需要从后往前获取) / Current time
    let beforeTime = endTime;

    // 循环获取数据 / Loop to fetch data
    while (beforeTime > startTime) {
      try {
        // 调用 OKX API / Call OKX API
        const response = await exchange.publicGetPublicOpenInterestHistory({
          instId,
          period: '5m',
          before: beforeTime,
          limit: 100,
        });

        // 增加请求计数 / Increment request count
        this.stats.totalRequests++;

        // 获取数据 / Get data
        const data = response.data || [];

        // 如果没有数据，跳出循环 / If no data, break
        if (data.length === 0) {
          break;
        }

        // 转换数据格式 / Convert data format
        const openInterestData = data.map(item => ({
          timestamp: parseInt(item.ts),
          openInterest: parseFloat(item.oi),
          openInterestValue: parseFloat(item.oiCcy || 0),
        }));

        // 过滤掉早于 startTime 的数据 / Filter out data before startTime
        const filteredData = openInterestData.filter(d => d.timestamp >= startTime);

        // 添加到缓冲区 / Add to buffer
        buffer.push(...filteredData);

        // 增加记录计数 / Increment record count
        this.stats.totalRecords += filteredData.length;

        // 更新 beforeTime / Update beforeTime
        beforeTime = parseInt(data[data.length - 1].ts) - 1;

        // 打印进度 / Print progress
        console.log(`${this.logPrefix} 已下载 ${buffer.length} 条 OKX 持仓量记录`);

        // 如果缓冲区达到批量大小，插入数据库 / If buffer reaches batch size, insert to DB
        if (buffer.length >= this.config.download.batchSize) {
          await this.clickhouse.insertOpenInterest('okx', symbol, buffer);
          buffer = [];
        }

        // 遵守速率限制 / Respect rate limit
        await sleep(this.config.download.rateLimit);

      } catch (error) {
        console.error(`${this.logPrefix} OKX 持仓量下载出错: ${error.message}`);
        this.stats.errors++;
        await sleep(5000);
        break;
      }
    }

    // 插入剩余数据 / Insert remaining data
    if (buffer.length > 0) {
      await this.clickhouse.insertOpenInterest('okx', symbol, buffer);
    }
  }

  /**
   * 下载标记价格数据
   * Download mark price data
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   */
  async downloadMarkPrice(exchangeName, symbol, startTime, endTime) {
    console.log(`\n${this.logPrefix} 开始下载 ${exchangeName} ${symbol} 标记价格...`);

    // 获取交易所实例 / Get exchange instance
    const exchange = this._getExchange(exchangeName);

    try {
      // 大多数交易所只提供当前标记价格，不提供历史数据
      // Most exchanges only provide current mark price, not historical data
      // 这里我们获取当前标记价格作为示例
      // Here we fetch current mark price as an example

      // 尝试获取标记价格 / Try to fetch mark price
      let markPriceData = null;

      if (exchangeName === 'binance') {
        // Binance 标记价格 / Binance mark price
        const response = await exchange.fapiPublicGetPremiumIndex({
          symbol: symbol.replace('/', '').replace(':USDT', ''),
        });

        markPriceData = {
          timestamp: Date.now(),
          markPrice: parseFloat(response.markPrice),
          indexPrice: parseFloat(response.indexPrice),
          estimatedSettlePrice: parseFloat(response.estimatedSettlePrice || 0),
        };

      } else if (exchangeName === 'bybit') {
        // Bybit 标记价格 / Bybit mark price
        const response = await exchange.publicGetV5MarketTickers({
          category: 'linear',
          symbol: symbol.replace('/', '').replace(':USDT', ''),
        });

        const ticker = response.result?.list?.[0];
        if (ticker) {
          markPriceData = {
            timestamp: Date.now(),
            markPrice: parseFloat(ticker.markPrice || 0),
            indexPrice: parseFloat(ticker.indexPrice || 0),
            estimatedSettlePrice: 0,
          };
        }

      } else if (exchangeName === 'okx') {
        // OKX 标记价格 / OKX mark price
        const instId = symbol.replace('/', '-').replace(':USDT', '') + '-SWAP';
        const response = await exchange.publicGetPublicMarkPrice({
          instId,
        });

        const data = response.data?.[0];
        if (data) {
          markPriceData = {
            timestamp: parseInt(data.ts),
            markPrice: parseFloat(data.markPx),
            indexPrice: 0,
            estimatedSettlePrice: 0,
          };
        }
      }

      // 增加请求计数 / Increment request count
      this.stats.totalRequests++;

      // 如果获取到数据，插入数据库 / If got data, insert to DB
      if (markPriceData) {
        await this.clickhouse.insertMarkPrice(exchangeName, symbol, [markPriceData]);
        this.stats.totalRecords++;
        console.log(`${this.logPrefix} 已获取 ${exchangeName} ${symbol} 当前标记价格: ${markPriceData.markPrice}`);
      }

      // 注意: 如果需要历史标记价格数据，可以从 K线数据中提取
      // 或者使用交易所提供的专门接口 (如果有的话)
      // Note: If historical mark price is needed, can extract from OHLCV data
      // or use exchange-specific API if available

      console.log(`${this.logPrefix} 标记价格历史数据需要从 K线或其他数据源计算`);

    } catch (error) {
      console.error(`${this.logPrefix} 下载标记价格出错: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * 运行完整下载任务
   * Run complete download task
   *
   * @param {Object} options - 下载选项 / Download options
   * @param {string[]} options.exchanges - 交易所列表 / Exchange list
   * @param {string[]} options.symbols - 交易对列表 / Symbol list
   * @param {string[]} options.dataTypes - 数据类型列表 / Data type list
   */
  async run(options) {
    // 解析选项 / Parse options
    const {
      exchanges = SUPPORTED_EXCHANGES,
      symbols = this.config.symbols,
      dataTypes = Object.values(DATA_TYPES),
    } = options;

    console.log('\n====================================');
    console.log('历史数据下载任务 / Historical Data Download Task');
    console.log('====================================');
    console.log(`交易所 / Exchanges: ${exchanges.join(', ')}`);
    console.log(`交易对 / Symbols: ${symbols.join(', ')}`);
    console.log(`数据类型 / Data Types: ${dataTypes.join(', ')}`);
    console.log('====================================\n');

    // 初始化下载器 / Initialize downloader
    await this.initialize(exchanges, dataTypes);

    // 解析时间范围 / Parse time range
    const startTime = parseDate(this.config.download.startDate);
    const endTime = parseDate(this.config.download.endDate);

    console.log(`\n时间范围 / Time Range: ${formatTimestamp(startTime)} ~ ${formatTimestamp(endTime)}\n`);

    // 遍历所有交易所 / Iterate all exchanges
    for (const exchangeName of exchanges) {
      console.log(`\n========== ${exchangeName.toUpperCase()} ==========\n`);

      // 遍历所有交易对 / Iterate all symbols
      for (const symbol of symbols) {
        // 遍历所有数据类型 / Iterate all data types
        for (const dataType of dataTypes) {
          try {
            // 根据数据类型调用不同的下载方法 / Call different download method based on data type
            switch (dataType) {
              case DATA_TYPES.OHLCV:
                // 下载 K线数据 / Download OHLCV
                await this.downloadOHLCV(exchangeName, symbol, startTime, endTime);
                break;

              case DATA_TYPES.FUNDING_RATE:
                // 下载资金费率 / Download funding rate
                await this.downloadFundingRate(exchangeName, symbol, startTime, endTime);
                break;

              case DATA_TYPES.OPEN_INTEREST:
                // 下载持仓量 / Download open interest
                await this.downloadOpenInterest(exchangeName, symbol, startTime, endTime);
                break;

              case DATA_TYPES.MARK_PRICE:
                // 下载标记价格 / Download mark price
                await this.downloadMarkPrice(exchangeName, symbol, startTime, endTime);
                break;

              default:
                console.warn(`${this.logPrefix} 未知的数据类型: ${dataType}`);
            }

          } catch (error) {
            // 记录错误并继续 / Log error and continue
            console.error(`${this.logPrefix} 下载 ${exchangeName} ${symbol} ${dataType} 失败: ${error.message}`);
            this.stats.errors++;
          }
        }
      }
    }

    // 打印统计信息 / Print statistics
    this._printStats();

    // 关闭连接 / Close connections
    await this.close();
  }

  /**
   * 打印统计信息
   * Print statistics
   * @private
   */
  _printStats() {
    // 计算运行时间 / Calculate running time
    const runningTime = Math.floor((Date.now() - this.stats.startTime) / 1000);

    console.log('\n====================================');
    console.log('下载统计 / Download Statistics');
    console.log('====================================');
    console.log(`总记录数 / Total Records: ${this.stats.totalRecords.toLocaleString()}`);
    console.log(`总请求数 / Total Requests: ${this.stats.totalRequests.toLocaleString()}`);
    console.log(`错误数 / Errors: ${this.stats.errors}`);
    console.log(`运行时间 / Running Time: ${runningTime} 秒 / seconds`);
    console.log('====================================\n');
  }

  /**
   * 关闭下载器
   * Close downloader
   */
  async close() {
    // 关闭 ClickHouse 连接 / Close ClickHouse connection
    await this.clickhouse.close();

    console.log(`${this.logPrefix} 下载器已关闭 / Downloader closed`);
  }
}

// ============================================
// 命令行接口 / Command Line Interface
// ============================================

/**
 * 解析命令行参数
 * Parse command line arguments
 *
 * @returns {Object} 解析后的参数 / Parsed arguments
 */
function parseCliArgs() {
  // 定义命令行选项 / Define CLI options
  const options = {
    // 交易所 / Exchange
    exchange: {
      type: 'string',
      short: 'e',
      default: 'all',
    },
    // 交易对 / Symbol
    symbol: {
      type: 'string',
      short: 's',
      default: 'BTC/USDT:USDT',
    },
    // 数据类型 / Data type
    type: {
      type: 'string',
      short: 't',
      default: 'all',
    },
    // 配置文件 / Config file
    config: {
      type: 'string',
      short: 'c',
    },
    // 起始日期 / Start date
    start: {
      type: 'string',
      default: '2020-01-01',
    },
    // 结束日期 / End date
    end: {
      type: 'string',
    },
    // ClickHouse 主机 / ClickHouse host
    'ch-host': {
      type: 'string',
      default: 'http://localhost:8123',
    },
    // ClickHouse 数据库 / ClickHouse database
    'ch-database': {
      type: 'string',
      default: 'quant',
    },
    // 帮助 / Help
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  };

  // 解析参数 / Parse arguments
  const { values } = parseArgs({ options, allowPositionals: true });

  // 返回解析后的值 / Return parsed values
  return values;
}

/**
 * 打印帮助信息
 * Print help message
 */
function printHelp() {
  console.log(`
历史数据下载脚本 / Historical Data Download Script
===================================================

用法 / Usage:
  node download-history.js [options]

选项 / Options:
  -e, --exchange <name>    交易所名称 (binance, bybit, okx, all)
                           Exchange name (default: all)

  -s, --symbol <symbol>    交易对 (例如: BTC/USDT:USDT)
                           Trading pair (default: BTC/USDT:USDT)

  -t, --type <type>        数据类型 (ohlcv, funding_rate, open_interest, mark_price, all)
                           Data type (default: all)

  -c, --config <file>      配置文件路径
                           Config file path

  --start <date>           起始日期 (YYYY-MM-DD)
                           Start date (default: 2020-01-01)

  --end <date>             结束日期 (YYYY-MM-DD)
                           End date (default: today)

  --ch-host <url>          ClickHouse 主机地址
                           ClickHouse host (default: http://localhost:8123)

  --ch-database <name>     ClickHouse 数据库名
                           ClickHouse database (default: quant)

  -h, --help               显示帮助信息
                           Show help message

示例 / Examples:
  # 下载所有交易所的 BTC 所有数据
  # Download all BTC data from all exchanges
  node download-history.js -s BTC/USDT:USDT

  # 只下载 Binance 的 K线数据
  # Download only Binance OHLCV data
  node download-history.js -e binance -t ohlcv -s BTC/USDT:USDT

  # 使用配置文件
  # Use config file
  node download-history.js -c config.json

  # 指定时间范围
  # Specify time range
  node download-history.js --start 2023-01-01 --end 2023-12-31
`);
}

/**
 * 主函数
 * Main function
 */
async function main() {
  // 解析命令行参数 / Parse CLI arguments
  const args = parseCliArgs();

  // 如果请求帮助，打印帮助并退出 / If help requested, print help and exit
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // 构建配置对象 / Build config object
  let config = { ...DEFAULT_CONFIG };

  // 如果指定了配置文件，加载它 / If config file specified, load it
  if (args.config) {
    try {
      // 读取配置文件 / Read config file
      const configPath = path.resolve(args.config);
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const fileConfig = JSON.parse(configContent);

      // 合并配置 / Merge config
      config = {
        clickhouse: { ...config.clickhouse, ...fileConfig.clickhouse },
        download: { ...config.download, ...fileConfig.download },
        symbols: fileConfig.symbols || config.symbols,
      };

      console.log(`已加载配置文件 / Loaded config file: ${configPath}`);

    } catch (error) {
      console.error(`加载配置文件失败 / Failed to load config: ${error.message}`);
      process.exit(1);
    }
  }

  // 应用命令行参数 / Apply CLI arguments
  config.clickhouse.host = args['ch-host'] || config.clickhouse.host;
  config.clickhouse.database = args['ch-database'] || config.clickhouse.database;
  config.download.startDate = args.start || config.download.startDate;
  config.download.endDate = args.end || config.download.endDate;

  // 解析交易所列表 / Parse exchange list
  let exchanges;
  if (args.exchange === 'all') {
    // 使用所有支持的交易所 / Use all supported exchanges
    exchanges = SUPPORTED_EXCHANGES;
  } else {
    // 使用指定的交易所 / Use specified exchanges
    exchanges = args.exchange.split(',').map(e => e.trim().toLowerCase());

    // 验证交易所 / Validate exchanges
    for (const e of exchanges) {
      if (!SUPPORTED_EXCHANGES.includes(e)) {
        console.error(`不支持的交易所 / Unsupported exchange: ${e}`);
        console.error(`支持的交易所 / Supported: ${SUPPORTED_EXCHANGES.join(', ')}`);
        process.exit(1);
      }
    }
  }

  // 解析交易对列表 / Parse symbol list
  const symbols = args.symbol.split(',').map(s => s.trim());

  // 解析数据类型列表 / Parse data type list
  let dataTypes;
  if (args.type === 'all') {
    // 使用所有数据类型 / Use all data types
    dataTypes = Object.values(DATA_TYPES);
  } else {
    // 使用指定的数据类型 / Use specified data types
    dataTypes = args.type.split(',').map(t => t.trim().toLowerCase());

    // 验证数据类型 / Validate data types
    const validTypes = Object.values(DATA_TYPES);
    for (const t of dataTypes) {
      if (!validTypes.includes(t)) {
        console.error(`不支持的数据类型 / Unsupported data type: ${t}`);
        console.error(`支持的类型 / Supported: ${validTypes.join(', ')}`);
        process.exit(1);
      }
    }
  }

  // 创建下载器实例 / Create downloader instance
  const downloader = new HistoricalDataDownloader(config);

  try {
    // 运行下载任务 / Run download task
    await downloader.run({
      exchanges,
      symbols,
      dataTypes,
    });

    console.log('\n下载任务完成 / Download task completed!\n');

  } catch (error) {
    // 记录错误 / Log error
    console.error(`\n下载任务失败 / Download task failed: ${error.message}\n`);
    console.error(error.stack);

    // 关闭下载器 / Close downloader
    await downloader.close();

    // 退出 / Exit
    process.exit(1);
  }
}

// ============================================
// 启动脚本 / Start Script
// ============================================

// 运行主函数 / Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
