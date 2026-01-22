/**
 * 交易记录写入器
 * Trade Record Writer
 *
 * 将交易记录写入 ClickHouse 进行长期存储和分析
 * Writes trade records to ClickHouse for long-term storage and analysis
 *
 * @module src/database/clickhouse/TradeWriter
 */

import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 批量写入大小 / Batch write size
  batchSize: 100, // 批次大小
  // 刷新间隔 (ms) / Flush interval (ms)
  flushInterval: 5000, // 刷新间隔 (ms)
  // 是否异步写入 / Whether to write asynchronously
  async: true, // 异步
  // 最大缓冲区大小 / Max buffer size
  maxBufferSize: 1000, // 最大Buffer大小
  // 重试次数 / Retry count
  maxRetries: 3, // 重试次数
  // 重试延迟 (ms) / Retry delay (ms)
  retryDelay: 1000, // 重试延迟 (ms)
}; // 结束代码块

/**
 * 交易记录写入器类
 * Trade Record Writer Class
 */
class TradeWriter extends EventEmitter { // 定义类 TradeWriter(继承EventEmitter)
  constructor(clickHouseClient, config = {}) { // 构造函数
    super(); // 调用父类

    this.clickhouse = clickHouseClient; // 设置 clickhouse
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 交易缓冲区 / Trade buffer
    this.buffer = []; // 设置 buffer

    // 刷新定时器 / Flush timer
    this.flushTimer = null; // 设置 flushTimer

    // 状态 / State
    this.isRunning = false; // 设置 isRunning
    this.isFlushing = false; // 设置 isFlushing

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalWritten: 0, // 总Written
      totalErrors: 0, // 总错误列表
      lastFlushTime: null, // lastFlush时间
      bufferSize: 0, // buffer大小
      totalVolume: 0, // 总成交量
      totalFees: 0, // 总Fees
    }; // 结束代码块
  } // 结束代码块

  /**
   * 启动写入器
   * Start the writer
   */
  start() { // 调用 start
    if (this.isRunning) return; // 条件判断 this.isRunning

    this.isRunning = true; // 设置 isRunning

    // 启动定时刷新 / Start periodic flush
    if (this.config.async && this.config.flushInterval > 0) { // 条件判断 this.config.async && this.config.flushInterva...
      this.flushTimer = setInterval(() => { // 设置 flushTimer
        this.flush().catch(err => this.emit('error', err)); // 调用 flush
      }, this.config.flushInterval); // 执行语句
    } // 结束代码块

    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止写入器
   * Stop the writer
   */
  async stop() { // 执行语句
    if (!this.isRunning) return; // 条件判断 !this.isRunning

    this.isRunning = false; // 设置 isRunning

    // 停止定时器 / Stop timer
    if (this.flushTimer) { // 条件判断 this.flushTimer
      clearInterval(this.flushTimer); // 调用 clearInterval
      this.flushTimer = null; // 设置 flushTimer
    } // 结束代码块

    // 刷新剩余交易 / Flush remaining trades
    await this.flush(); // 等待异步结果

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 写入单条交易记录
   * Write single trade record
   *
   * @param {Object} trade - 交易数据 / Trade data
   */
  async write(trade) { // 执行语句
    const formattedTrade = this._formatTrade(trade); // 定义常量 formattedTrade

    if (this.config.async) { // 条件判断 this.config.async
      // 异步模式: 添加到缓冲区 / Async mode: add to buffer
      this.buffer.push(formattedTrade); // 访问 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats

      // 检查是否需要刷新 / Check if flush is needed
      if (this.buffer.length >= this.config.batchSize) { // 条件判断 this.buffer.length >= this.config.batchSize
        await this.flush(); // 等待异步结果
      } // 结束代码块

      // 检查缓冲区是否过大 / Check if buffer is too large
      if (this.buffer.length >= this.config.maxBufferSize) { // 条件判断 this.buffer.length >= this.config.maxBufferSize
        this.emit('buffer:overflow', { size: this.buffer.length }); // 调用 emit
        await this.flush(); // 等待异步结果
      } // 结束代码块

    } else { // 执行语句
      // 同步模式: 直接写入 / Sync mode: write directly
      await this._writeBatch([formattedTrade]); // 等待异步结果
      this._updateVolumeStats([formattedTrade]); // 调用 _updateVolumeStats
    } // 结束代码块
  } // 结束代码块

  /**
   * 批量写入交易记录
   * Write batch of trade records
   *
   * @param {Array} trades - 交易数组 / Trade array
   */
  async writeBatch(trades) { // 执行语句
    const formattedTrades = trades.map(trade => this._formatTrade(trade)); // 定义函数 formattedTrades

    if (this.config.async) { // 条件判断 this.config.async
      this.buffer.push(...formattedTrades); // 访问 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats

      if (this.buffer.length >= this.config.batchSize) { // 条件判断 this.buffer.length >= this.config.batchSize
        await this.flush(); // 等待异步结果
      } // 结束代码块
    } else { // 执行语句
      await this._writeBatch(formattedTrades); // 等待异步结果
      this._updateVolumeStats(formattedTrades); // 调用 _updateVolumeStats
    } // 结束代码块
  } // 结束代码块

  /**
   * 刷新缓冲区到 ClickHouse
   * Flush buffer to ClickHouse
   */
  async flush() { // 执行语句
    if (this.isFlushing || this.buffer.length === 0) { // 条件判断 this.isFlushing || this.buffer.length === 0
      return { flushed: 0 }; // 返回结果
    } // 结束代码块

    this.isFlushing = true; // 设置 isFlushing
    const tradesToFlush = [...this.buffer]; // 定义常量 tradesToFlush
    this.buffer = []; // 设置 buffer
    this.stats.bufferSize = 0; // 访问 stats

    try { // 尝试执行
      await this._writeBatch(tradesToFlush); // 等待异步结果

      this.stats.totalWritten += tradesToFlush.length; // 访问 stats
      this.stats.lastFlushTime = new Date().toISOString(); // 访问 stats
      this._updateVolumeStats(tradesToFlush); // 调用 _updateVolumeStats

      this.emit('flush', { count: tradesToFlush.length }); // 调用 emit

      return { flushed: tradesToFlush.length }; // 返回结果

    } catch (error) { // 执行语句
      // 写入失败时恢复缓冲区 / Restore buffer on write failure
      this.buffer = [...tradesToFlush, ...this.buffer]; // 设置 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats
      this.stats.totalErrors++; // 访问 stats

      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常

    } finally { // 执行语句
      this.isFlushing = false; // 设置 isFlushing
    } // 结束代码块
  } // 结束代码块

  /**
   * 格式化交易数据
   * Format trade data
   *
   * @param {Object} trade - 原始交易 / Raw trade
   * @returns {Object} 格式化后的交易 / Formatted trade
   * @private
   */
  _formatTrade(trade) { // 调用 _formatTrade
    const timestamp = trade.timestamp // 定义常量 timestamp
      ? this._toDateTime(trade.timestamp) // 执行语句
      : new Date().toISOString().replace('T', ' ').replace('Z', ''); // 执行语句

    return { // 返回结果
      trade_id: trade.tradeId || trade.id || this._generateTradeId(), // 交易ID
      order_id: trade.orderId || '', // 订单ID
      symbol: trade.symbol || '', // 交易对
      side: trade.side || 'buy', // 方向
      type: trade.type || 'market', // 类型
      amount: parseFloat(trade.amount) || 0, // 数量
      price: parseFloat(trade.price) || 0, // 价格
      cost: parseFloat(trade.cost) || (parseFloat(trade.amount) * parseFloat(trade.price)) || 0, // cost
      fee: parseFloat(trade.fee) || 0, // 手续费
      fee_currency: trade.feeCurrency || '', // 手续费currency
      realized_pnl: parseFloat(trade.realizedPnl) || 0, // 已实现盈亏
      exchange: trade.exchange || '', // 交易所
      strategy: trade.strategy || '', // 策略
      timestamp, // 执行语句
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '', // 元数据
    }; // 结束代码块
  } // 结束代码块

  /**
   * 生成交易 ID
   * Generate trade ID
   *
   * @returns {string} 交易 ID / Trade ID
   * @private
   */
  _generateTradeId() { // 调用 _generateTradeId
    return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; // 返回结果
  } // 结束代码块

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   *
   * @param {number|string|Date} timestamp - 时间戳 / Timestamp
   * @returns {string} DateTime 字符串 / DateTime string
   * @private
   */
  _toDateTime(timestamp) { // 调用 _toDateTime
    if (!timestamp) { // 条件判断 !timestamp
      return '1970-01-01 00:00:00.000'; // 返回结果
    } // 结束代码块

    let date; // 定义变量 date
    if (typeof timestamp === 'number') { // 条件判断 typeof timestamp === 'number'
      date = new Date(timestamp); // 赋值 date
    } else if (typeof timestamp === 'string') { // 执行语句
      date = new Date(timestamp); // 赋值 date
    } else if (timestamp instanceof Date) { // 执行语句
      date = timestamp; // 赋值 date
    } else { // 执行语句
      return '1970-01-01 00:00:00.000'; // 返回结果
    } // 结束代码块

    return date.toISOString().replace('T', ' ').replace('Z', ''); // 返回结果
  } // 结束代码块

  /**
   * 批量写入到 ClickHouse
   * Write batch to ClickHouse
   *
   * @param {Array} trades - 交易数组 / Trade array
   * @private
   */
  async _writeBatch(trades) { // 执行语句
    let retries = 0; // 定义变量 retries
    let lastError; // 定义变量 lastError

    while (retries < this.config.maxRetries) { // 循环条件 retries < this.config.maxRetries
      try { // 尝试执行
        await this.clickhouse.insert('trades', trades); // 等待异步结果
        return; // 返回结果
      } catch (error) { // 执行语句
        lastError = error; // 赋值 lastError
        retries++; // 执行语句

        if (retries < this.config.maxRetries) { // 条件判断 retries < this.config.maxRetries
          // 等待后重试 / Wait before retry
          await new Promise(resolve => // 等待异步结果
            setTimeout(resolve, this.config.retryDelay * retries) // 设置延时任务
          ); // 结束调用或参数
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    throw lastError; // 抛出异常
  } // 结束代码块

  /**
   * 更新交易量统计
   * Update volume statistics
   *
   * @param {Array} trades - 交易数组 / Trade array
   * @private
   */
  _updateVolumeStats(trades) { // 调用 _updateVolumeStats
    for (const trade of trades) { // 循环 const trade of trades
      this.stats.totalVolume += parseFloat(trade.cost) || 0; // 访问 stats
      this.stats.totalFees += parseFloat(trade.fee) || 0; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 查询交易记录
   * Query trade records
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 交易数组 / Trade array
   */
  async query(options = {}) { // 执行语句
    const { // 解构赋值
      symbol, // 执行语句
      side, // 执行语句
      exchange, // 执行语句
      strategy, // 执行语句
      startTime, // 执行语句
      endTime, // 执行语句
      limit = 100, // 赋值 limit
      offset = 0, // 赋值 offset
    } = options; // 执行语句

    let query = 'SELECT * FROM trades WHERE 1=1'; // 定义变量 query
    const params = {}; // 定义常量 params

    if (symbol) { // 条件判断 symbol
      query += ' AND symbol = {symbol:String}'; // 执行语句
      params.symbol = symbol; // 赋值 params.symbol
    } // 结束代码块

    if (side) { // 条件判断 side
      query += ' AND side = {side:String}'; // 执行语句
      params.side = side; // 赋值 params.side
    } // 结束代码块

    if (exchange) { // 条件判断 exchange
      query += ' AND exchange = {exchange:String}'; // 执行语句
      params.exchange = exchange; // 赋值 params.exchange
    } // 结束代码块

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    query += ' ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}'; // 执行语句
    params.limit = limit; // 赋值 params.limit
    params.offset = offset; // 赋值 params.offset

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取交易统计
   * Get trade statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Object} 统计数据 / Statistics
   */
  async getTradeStats(options = {}) { // 执行语句
    const { symbol, exchange, strategy, startTime, endTime } = options; // 解构赋值

    let query = `
      SELECT
        count() as total_trades,
        sum(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) as buy_count,
        sum(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) as sell_count,
        sum(cost) as total_volume,
        sum(fee) as total_fees,
        sum(realized_pnl) as total_pnl,
        avg(price) as avg_price,
        min(timestamp) as first_trade,
        max(timestamp) as last_trade
      FROM trades
      WHERE 1=1
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (symbol) { // 条件判断 symbol
      query += ' AND symbol = {symbol:String}'; // 执行语句
      params.symbol = symbol; // 赋值 params.symbol
    } // 结束代码块

    if (exchange) { // 条件判断 exchange
      query += ' AND exchange = {exchange:String}'; // 执行语句
      params.exchange = exchange; // 赋值 params.exchange
    } // 结束代码块

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    const result = await this.clickhouse.query(query, params); // 定义常量 result
    return result[0] || null; // 返回结果
  } // 结束代码块

  /**
   * 获取每日交易统计
   * Get daily trade statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getDailyStats(options = {}) { // 执行语句
    const { symbol, strategy, startTime, endTime, limit = 30 } = options; // 解构赋值

    let query = `
      SELECT
        toDate(timestamp) as date,
        count() as trades,
        sum(cost) as volume,
        sum(fee) as fees,
        sum(realized_pnl) as pnl,
        sum(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        sum(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      WHERE 1=1
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (symbol) { // 条件判断 symbol
      query += ' AND symbol = {symbol:String}'; // 执行语句
      params.symbol = symbol; // 赋值 params.symbol
    } // 结束代码块

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    query += ' GROUP BY date ORDER BY date DESC LIMIT {limit:UInt32}'; // 执行语句
    params.limit = limit; // 赋值 params.limit

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取按交易对分组的统计
   * Get statistics grouped by symbol
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getStatsBySymbol(options = {}) { // 执行语句
    const { startTime, endTime, strategy } = options; // 解构赋值

    let query = `
      SELECT
        symbol,
        count() as trades,
        sum(cost) as volume,
        sum(fee) as fees,
        sum(realized_pnl) as pnl,
        avg(price) as avg_price
      FROM trades
      WHERE 1=1
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    query += ' GROUP BY symbol ORDER BY volume DESC'; // 执行语句

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取按策略分组的统计
   * Get statistics grouped by strategy
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getStatsByStrategy(options = {}) { // 执行语句
    const { startTime, endTime } = options; // 解构赋值

    let query = `
      SELECT
        strategy,
        count() as trades,
        sum(cost) as volume,
        sum(fee) as fees,
        sum(realized_pnl) as pnl,
        sum(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        sum(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      WHERE strategy != ''
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    query += ' GROUP BY strategy ORDER BY pnl DESC'; // 执行语句

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取盈亏曲线数据
   * Get PnL curve data
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} PnL 曲线数据 / PnL curve data
   */
  async getPnLCurve(options = {}) { // 执行语句
    const { strategy, startTime, endTime } = options; // 解构赋值

    let query = `
      SELECT
        timestamp,
        realized_pnl,
        sum(realized_pnl) OVER (ORDER BY timestamp) as cumulative_pnl
      FROM trades
      WHERE realized_pnl != 0
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    query += ' ORDER BY timestamp ASC'; // 执行语句

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取胜率统计
   * Get win rate statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Object} 胜率统计 / Win rate statistics
   */
  async getWinRateStats(options = {}) { // 执行语句
    const { strategy, startTime, endTime } = options; // 解构赋值

    let query = `
      SELECT
        count() as total_trades,
        sum(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        sum(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses,
        sum(CASE WHEN realized_pnl = 0 THEN 1 ELSE 0 END) as breakeven,
        avg(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE NULL END) as avg_win,
        avg(CASE WHEN realized_pnl < 0 THEN realized_pnl ELSE NULL END) as avg_loss,
        max(realized_pnl) as max_win,
        min(realized_pnl) as max_loss
      FROM trades
      WHERE realized_pnl != 0
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (strategy) { // 条件判断 strategy
      query += ' AND strategy = {strategy:String}'; // 执行语句
      params.strategy = strategy; // 赋值 params.strategy
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = this._toDateTime(startTime); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = this._toDateTime(endTime); // 赋值 params.endTime
    } // 结束代码块

    const result = await this.clickhouse.query(query, params); // 定义常量 result
    const stats = result[0]; // 定义常量 stats

    if (stats) { // 条件判断 stats
      const totalTrades = parseInt(stats.total_trades) || 0; // 定义常量 totalTrades
      const wins = parseInt(stats.wins) || 0; // 定义常量 wins
      const avgWin = parseFloat(stats.avg_win) || 0; // 定义常量 avgWin
      const avgLoss = parseFloat(stats.avg_loss) || 0; // 定义常量 avgLoss

      stats.win_rate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0; // 赋值 stats.win_rate
      stats.profit_factor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0; // 赋值 stats.profit_factor
    } // 结束代码块

    return stats || null; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() { // 调用 getStats
    return { ...this.stats }; // 返回结果
  } // 结束代码块

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() { // 调用 resetStats
    this.stats = { // 设置 stats
      totalWritten: 0, // 总Written
      totalErrors: 0, // 总错误列表
      lastFlushTime: null, // lastFlush时间
      bufferSize: 0, // buffer大小
      totalVolume: 0, // 总成交量
      totalFees: 0, // 总Fees
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export { TradeWriter }; // 导出命名成员
export default TradeWriter; // 默认导出
