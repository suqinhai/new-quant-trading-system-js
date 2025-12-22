/**
 * 交易记录写入器
 * Trade Record Writer
 *
 * 将交易记录写入 ClickHouse 进行长期存储和分析
 * Writes trade records to ClickHouse for long-term storage and analysis
 *
 * @module src/database/clickhouse/TradeWriter
 */

import { EventEmitter } from 'events';

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 批量写入大小 / Batch write size
  batchSize: 100,
  // 刷新间隔 (ms) / Flush interval (ms)
  flushInterval: 5000,
  // 是否异步写入 / Whether to write asynchronously
  async: true,
  // 最大缓冲区大小 / Max buffer size
  maxBufferSize: 1000,
  // 重试次数 / Retry count
  maxRetries: 3,
  // 重试延迟 (ms) / Retry delay (ms)
  retryDelay: 1000,
};

/**
 * 交易记录写入器类
 * Trade Record Writer Class
 */
class TradeWriter extends EventEmitter {
  constructor(clickHouseClient, config = {}) {
    super();

    this.clickhouse = clickHouseClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 交易缓冲区 / Trade buffer
    this.buffer = [];

    // 刷新定时器 / Flush timer
    this.flushTimer = null;

    // 状态 / State
    this.isRunning = false;
    this.isFlushing = false;

    // 统计信息 / Statistics
    this.stats = {
      totalWritten: 0,
      totalErrors: 0,
      lastFlushTime: null,
      bufferSize: 0,
      totalVolume: 0,
      totalFees: 0,
    };
  }

  /**
   * 启动写入器
   * Start the writer
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // 启动定时刷新 / Start periodic flush
    if (this.config.async && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => this.emit('error', err));
      }, this.config.flushInterval);
    }

    this.emit('started');
  }

  /**
   * 停止写入器
   * Stop the writer
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 停止定时器 / Stop timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷新剩余交易 / Flush remaining trades
    await this.flush();

    this.emit('stopped');
  }

  /**
   * 写入单条交易记录
   * Write single trade record
   *
   * @param {Object} trade - 交易数据 / Trade data
   */
  async write(trade) {
    const formattedTrade = this._formatTrade(trade);

    if (this.config.async) {
      // 异步模式: 添加到缓冲区 / Async mode: add to buffer
      this.buffer.push(formattedTrade);
      this.stats.bufferSize = this.buffer.length;

      // 检查是否需要刷新 / Check if flush is needed
      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }

      // 检查缓冲区是否过大 / Check if buffer is too large
      if (this.buffer.length >= this.config.maxBufferSize) {
        this.emit('buffer:overflow', { size: this.buffer.length });
        await this.flush();
      }

    } else {
      // 同步模式: 直接写入 / Sync mode: write directly
      await this._writeBatch([formattedTrade]);
      this._updateVolumeStats([formattedTrade]);
    }
  }

  /**
   * 批量写入交易记录
   * Write batch of trade records
   *
   * @param {Array} trades - 交易数组 / Trade array
   */
  async writeBatch(trades) {
    const formattedTrades = trades.map(trade => this._formatTrade(trade));

    if (this.config.async) {
      this.buffer.push(...formattedTrades);
      this.stats.bufferSize = this.buffer.length;

      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }
    } else {
      await this._writeBatch(formattedTrades);
      this._updateVolumeStats(formattedTrades);
    }
  }

  /**
   * 刷新缓冲区到 ClickHouse
   * Flush buffer to ClickHouse
   */
  async flush() {
    if (this.isFlushing || this.buffer.length === 0) {
      return { flushed: 0 };
    }

    this.isFlushing = true;
    const tradesToFlush = [...this.buffer];
    this.buffer = [];
    this.stats.bufferSize = 0;

    try {
      await this._writeBatch(tradesToFlush);

      this.stats.totalWritten += tradesToFlush.length;
      this.stats.lastFlushTime = new Date().toISOString();
      this._updateVolumeStats(tradesToFlush);

      this.emit('flush', { count: tradesToFlush.length });

      return { flushed: tradesToFlush.length };

    } catch (error) {
      // 写入失败时恢复缓冲区 / Restore buffer on write failure
      this.buffer = [...tradesToFlush, ...this.buffer];
      this.stats.bufferSize = this.buffer.length;
      this.stats.totalErrors++;

      this.emit('error', error);
      throw error;

    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 格式化交易数据
   * Format trade data
   *
   * @param {Object} trade - 原始交易 / Raw trade
   * @returns {Object} 格式化后的交易 / Formatted trade
   * @private
   */
  _formatTrade(trade) {
    const timestamp = trade.timestamp
      ? this._toDateTime(trade.timestamp)
      : new Date().toISOString().replace('T', ' ').replace('Z', '');

    return {
      trade_id: trade.tradeId || trade.id || this._generateTradeId(),
      order_id: trade.orderId || '',
      symbol: trade.symbol || '',
      side: trade.side || 'buy',
      type: trade.type || 'market',
      amount: parseFloat(trade.amount) || 0,
      price: parseFloat(trade.price) || 0,
      cost: parseFloat(trade.cost) || (parseFloat(trade.amount) * parseFloat(trade.price)) || 0,
      fee: parseFloat(trade.fee) || 0,
      fee_currency: trade.feeCurrency || '',
      realized_pnl: parseFloat(trade.realizedPnl) || 0,
      exchange: trade.exchange || '',
      strategy: trade.strategy || '',
      timestamp,
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '',
    };
  }

  /**
   * 生成交易 ID
   * Generate trade ID
   *
   * @returns {string} 交易 ID / Trade ID
   * @private
   */
  _generateTradeId() {
    return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   *
   * @param {number|string|Date} timestamp - 时间戳 / Timestamp
   * @returns {string} DateTime 字符串 / DateTime string
   * @private
   */
  _toDateTime(timestamp) {
    if (!timestamp) {
      return '1970-01-01 00:00:00.000';
    }

    let date;
    if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return '1970-01-01 00:00:00.000';
    }

    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * 批量写入到 ClickHouse
   * Write batch to ClickHouse
   *
   * @param {Array} trades - 交易数组 / Trade array
   * @private
   */
  async _writeBatch(trades) {
    let retries = 0;
    let lastError;

    while (retries < this.config.maxRetries) {
      try {
        await this.clickhouse.insert('trades', trades);
        return;
      } catch (error) {
        lastError = error;
        retries++;

        if (retries < this.config.maxRetries) {
          // 等待后重试 / Wait before retry
          await new Promise(resolve =>
            setTimeout(resolve, this.config.retryDelay * retries)
          );
        }
      }
    }

    throw lastError;
  }

  /**
   * 更新交易量统计
   * Update volume statistics
   *
   * @param {Array} trades - 交易数组 / Trade array
   * @private
   */
  _updateVolumeStats(trades) {
    for (const trade of trades) {
      this.stats.totalVolume += parseFloat(trade.cost) || 0;
      this.stats.totalFees += parseFloat(trade.fee) || 0;
    }
  }

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
  async query(options = {}) {
    const {
      symbol,
      side,
      exchange,
      strategy,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
    } = options;

    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = {};

    if (symbol) {
      query += ' AND symbol = {symbol:String}';
      params.symbol = symbol;
    }

    if (side) {
      query += ' AND side = {side:String}';
      params.side = side;
    }

    if (exchange) {
      query += ' AND exchange = {exchange:String}';
      params.exchange = exchange;
    }

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    query += ' ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}';
    params.limit = limit;
    params.offset = offset;

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取交易统计
   * Get trade statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Object} 统计数据 / Statistics
   */
  async getTradeStats(options = {}) {
    const { symbol, exchange, strategy, startTime, endTime } = options;

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
    `;
    const params = {};

    if (symbol) {
      query += ' AND symbol = {symbol:String}';
      params.symbol = symbol;
    }

    if (exchange) {
      query += ' AND exchange = {exchange:String}';
      params.exchange = exchange;
    }

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    const result = await this.clickhouse.query(query, params);
    return result[0] || null;
  }

  /**
   * 获取每日交易统计
   * Get daily trade statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getDailyStats(options = {}) {
    const { symbol, strategy, startTime, endTime, limit = 30 } = options;

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
    `;
    const params = {};

    if (symbol) {
      query += ' AND symbol = {symbol:String}';
      params.symbol = symbol;
    }

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    query += ' GROUP BY date ORDER BY date DESC LIMIT {limit:UInt32}';
    params.limit = limit;

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取按交易对分组的统计
   * Get statistics grouped by symbol
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getStatsBySymbol(options = {}) {
    const { startTime, endTime, strategy } = options;

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
    `;
    const params = {};

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    query += ' GROUP BY symbol ORDER BY volume DESC';

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取按策略分组的统计
   * Get statistics grouped by strategy
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getStatsByStrategy(options = {}) {
    const { startTime, endTime } = options;

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
    `;
    const params = {};

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    query += ' GROUP BY strategy ORDER BY pnl DESC';

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取盈亏曲线数据
   * Get PnL curve data
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} PnL 曲线数据 / PnL curve data
   */
  async getPnLCurve(options = {}) {
    const { strategy, startTime, endTime } = options;

    let query = `
      SELECT
        timestamp,
        realized_pnl,
        sum(realized_pnl) OVER (ORDER BY timestamp) as cumulative_pnl
      FROM trades
      WHERE realized_pnl != 0
    `;
    const params = {};

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    query += ' ORDER BY timestamp ASC';

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取胜率统计
   * Get win rate statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Object} 胜率统计 / Win rate statistics
   */
  async getWinRateStats(options = {}) {
    const { strategy, startTime, endTime } = options;

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
    `;
    const params = {};

    if (strategy) {
      query += ' AND strategy = {strategy:String}';
      params.strategy = strategy;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = this._toDateTime(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = this._toDateTime(endTime);
    }

    const result = await this.clickhouse.query(query, params);
    const stats = result[0];

    if (stats) {
      const totalTrades = parseInt(stats.total_trades) || 0;
      const wins = parseInt(stats.wins) || 0;
      const avgWin = parseFloat(stats.avg_win) || 0;
      const avgLoss = parseFloat(stats.avg_loss) || 0;

      stats.win_rate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      stats.profit_factor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
    }

    return stats || null;
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalWritten: 0,
      totalErrors: 0,
      lastFlushTime: null,
      bufferSize: 0,
      totalVolume: 0,
      totalFees: 0,
    };
  }
}

export { TradeWriter };
export default TradeWriter;
