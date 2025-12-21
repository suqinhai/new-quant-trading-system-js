/**
 * 交易数据仓库
 * Trade Repository
 *
 * 提供交易数据的高级查询和分析功能
 * Provides advanced query and analysis for trade data
 *
 * @module src/database/TradeRepository
 */

/**
 * 交易数据仓库类
 */
class TradeRepository {
  constructor(db) {
    this.db = db;
  }

  // ============================================
  // 交易查询 Trade Queries
  // ============================================

  /**
   * 获取交易统计
   * @param {Object} options - 查询选项
   */
  getTradeStats(options = {}) {
    const { symbol, strategy, exchange, startTime, endTime } = options;

    let sql = `
      SELECT
        COUNT(*) as totalTrades,
        SUM(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) as buyCount,
        SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) as sellCount,
        SUM(cost) as totalVolume,
        SUM(fee) as totalFees,
        SUM(realized_pnl) as totalPnl,
        AVG(price) as avgPrice,
        MIN(timestamp) as firstTrade,
        MAX(timestamp) as lastTrade
      FROM trades
      WHERE 1=1
    `;

    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }
    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    return this.db.queryOne(sql, params);
  }

  /**
   * 获取每日交易统计
   * @param {Object} options - 查询选项
   */
  getDailyStats(options = {}) {
    const { symbol, strategy, startTime, endTime, limit = 30 } = options;

    let sql = `
      SELECT
        date(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as trades,
        SUM(cost) as volume,
        SUM(fee) as fees,
        SUM(realized_pnl) as pnl,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      WHERE 1=1
    `;

    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }
    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ` GROUP BY date ORDER BY date DESC LIMIT ?`;
    params.push(limit);

    return this.db.query(sql, params);
  }

  /**
   * 获取按交易对分组的统计
   */
  getStatsBySymbol(options = {}) {
    const { startTime, endTime, strategy } = options;

    let sql = `
      SELECT
        symbol,
        COUNT(*) as trades,
        SUM(cost) as volume,
        SUM(fee) as fees,
        SUM(realized_pnl) as pnl,
        AVG(price) as avgPrice
      FROM trades
      WHERE 1=1
    `;

    const params = [];

    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' GROUP BY symbol ORDER BY volume DESC';

    return this.db.query(sql, params);
  }

  /**
   * 获取按策略分组的统计
   */
  getStatsByStrategy(options = {}) {
    const { startTime, endTime } = options;

    let sql = `
      SELECT
        strategy,
        COUNT(*) as trades,
        SUM(cost) as volume,
        SUM(fee) as fees,
        SUM(realized_pnl) as pnl,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      WHERE strategy IS NOT NULL
    `;

    const params = [];

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' GROUP BY strategy ORDER BY pnl DESC';

    return this.db.query(sql, params);
  }

  /**
   * 获取最近交易
   * @param {number} limit - 限制数量
   */
  getRecentTrades(limit = 50) {
    return this.db.query(
      'SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
  }

  /**
   * 搜索交易
   * @param {Object} criteria - 搜索条件
   */
  searchTrades(criteria = {}) {
    const {
      symbol,
      side,
      strategy,
      exchange,
      startTime,
      endTime,
      minAmount,
      maxAmount,
      limit = 100,
      offset = 0,
    } = criteria;

    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }
    if (side) {
      sql += ' AND side = ?';
      params.push(side);
    }
    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }
    if (minAmount) {
      sql += ' AND amount >= ?';
      params.push(minAmount);
    }
    if (maxAmount) {
      sql += ' AND amount <= ?';
      params.push(maxAmount);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.query(sql, params);
  }

  // ============================================
  // 持仓查询 Position Queries
  // ============================================

  /**
   * 获取持仓汇总
   */
  getPositionSummary() {
    return this.db.query(`
      SELECT
        symbol,
        side,
        SUM(amount) as totalAmount,
        AVG(entry_price) as avgEntryPrice,
        SUM(unrealized_pnl) as totalUnrealizedPnl,
        SUM(realized_pnl) as totalRealizedPnl,
        COUNT(*) as positionCount
      FROM positions
      WHERE status = 'open'
      GROUP BY symbol, side
    `);
  }

  /**
   * 获取历史持仓
   * @param {Object} options - 查询选项
   */
  getHistoricalPositions(options = {}) {
    const { symbol, strategy, startTime, endTime, limit = 100 } = options;

    let sql = `
      SELECT *
      FROM positions
      WHERE status != 'open'
    `;

    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }
    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND closed_at >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND closed_at <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY closed_at DESC LIMIT ?';
    params.push(limit);

    return this.db.query(sql, params);
  }

  // ============================================
  // 订单查询 Order Queries
  // ============================================

  /**
   * 获取订单统计
   */
  getOrderStats(options = {}) {
    const { symbol, strategy, startTime, endTime } = options;

    let sql = `
      SELECT
        COUNT(*) as totalOrders,
        SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) as filledOrders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
        SUM(CASE WHEN status IN ('open', 'pending', 'partially_filled') THEN 1 ELSE 0 END) as openOrders,
        SUM(cost) as totalVolume,
        SUM(fee) as totalFees,
        AVG(CASE WHEN status = 'filled' THEN filled / amount ELSE NULL END) as avgFillRate
      FROM orders
      WHERE 1=1
    `;

    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }
    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND created_at >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND created_at <= ?';
      params.push(endTime);
    }

    return this.db.queryOne(sql, params);
  }

  /**
   * 获取失败订单
   * @param {number} limit - 限制数量
   */
  getFailedOrders(limit = 50) {
    return this.db.query(
      `SELECT * FROM orders
       WHERE status = 'failed' OR error_message IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  }

  // ============================================
  // PnL 分析 PnL Analysis
  // ============================================

  /**
   * 获取盈亏曲线数据
   * @param {Object} options - 查询选项
   */
  getPnLCurve(options = {}) {
    const { strategy, startTime, endTime } = options;

    let sql = `
      SELECT
        timestamp,
        realized_pnl,
        SUM(realized_pnl) OVER (ORDER BY timestamp) as cumulative_pnl
      FROM trades
      WHERE realized_pnl IS NOT NULL
    `;

    const params = [];

    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY timestamp ASC';

    return this.db.query(sql, params);
  }

  /**
   * 计算最大回撤
   * @param {Object} options - 查询选项
   */
  calculateMaxDrawdown(options = {}) {
    const pnlCurve = this.getPnLCurve(options);

    if (pnlCurve.length === 0) {
      return { maxDrawdown: 0, maxDrawdownPercent: 0 };
    }

    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const point of pnlCurve) {
      const cumPnl = point.cumulative_pnl || 0;

      if (cumPnl > peak) {
        peak = cumPnl;
      }

      const drawdown = peak - cumPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * 获取胜率统计
   * @param {Object} options - 查询选项
   */
  getWinRateStats(options = {}) {
    const { strategy, startTime, endTime } = options;

    let sql = `
      SELECT
        COUNT(*) as totalTrades,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN realized_pnl = 0 THEN 1 ELSE 0 END) as breakeven,
        AVG(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE NULL END) as avgWin,
        AVG(CASE WHEN realized_pnl < 0 THEN realized_pnl ELSE NULL END) as avgLoss,
        MAX(realized_pnl) as maxWin,
        MIN(realized_pnl) as maxLoss
      FROM trades
      WHERE realized_pnl IS NOT NULL
    `;

    const params = [];

    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }
    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    const result = this.db.queryOne(sql, params);

    if (result) {
      result.winRate = result.totalTrades > 0
        ? (result.wins / result.totalTrades) * 100
        : 0;

      // 盈亏比
      result.profitFactor = result.avgLoss !== 0
        ? Math.abs(result.avgWin / result.avgLoss)
        : 0;
    }

    return result;
  }
}

export { TradeRepository };
export default TradeRepository;
