/**
 * RESTful API 路由 - 交易记录
 * Trade Records Routes
 *
 * @module src/api/routes/trades
 */

import { Router } from 'express';

/**
 * 创建交易记录路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createTradeRoutes(deps = {}) {
  const router = Router();
  const { tradeRepository, orderStore } = deps;

  /**
   * GET /api/trades
   * 获取交易列表
   */
  router.get('/', async (req, res) => {
    try {
      const {
        page = 1,
        pageSize = 20,
        symbol,
        side,
        strategy,
        startDate,
        endDate,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      let trades = [];
      let total = 0;

      if (tradeRepository) {
        const result = await tradeRepository.getTradeHistory({
          symbol,
          side,
          strategy,
          startDate,
          endDate,
          limit: parseInt(pageSize),
          offset: (page - 1) * pageSize,
          sortBy,
          sortOrder,
        });
        trades = result.trades || [];
        total = result.total || trades.length;
      }

      res.json({
        success: true,
        data: trades,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/stats
   * 获取交易统计
   */
  router.get('/stats', async (req, res) => {
    try {
      const { startDate, endDate, symbol, strategy } = req.query;

      let stats = {
        totalTrades: 0,
        buyCount: 0,
        sellCount: 0,
        totalVolume: 0,
        totalFees: 0,
        totalPnL: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgPnL: 0,
        avgWin: 0,
        avgLoss: 0,
      };

      if (tradeRepository) {
        stats = await tradeRepository.getTradeStats({
          startDate,
          endDate,
          symbol,
          strategy,
        });
      }

      // 计算衍生指标
      if (stats.totalTrades > 0) {
        stats.winRate = stats.winCount / stats.totalTrades;
        stats.avgPnL = stats.totalPnL / stats.totalTrades;
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/:id
   * 获取交易详情
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let trade = null;
      if (tradeRepository) {
        trade = await tradeRepository.getById(id);
      }

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({ success: true, data: trade });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/export
   * 导出交易数据
   */
  router.get('/export', async (req, res) => {
    try {
      const { format = 'csv', startDate, endDate, symbol, strategy } = req.query;

      let trades = [];
      if (tradeRepository) {
        const result = await tradeRepository.getTradeHistory({
          startDate,
          endDate,
          symbol,
          strategy,
          limit: 10000,
        });
        trades = result.trades || [];
      }

      if (format === 'csv') {
        // 生成 CSV
        const headers = ['时间', '交易ID', '交易对', '方向', '类型', '数量', '价格', '金额', '手续费', '盈亏', '策略', '交易所'];
        const rows = trades.map(t => [
          new Date(t.timestamp).toISOString(),
          t.tradeId,
          t.symbol,
          t.side,
          t.type,
          t.amount,
          t.price,
          t.cost,
          t.fee,
          t.realizedPnL || '',
          t.strategy || '',
          t.exchange,
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=trades_${Date.now()}.csv`);
        res.send('\uFEFF' + csv); // BOM for Excel
      } else {
        res.json({ success: true, data: trades });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/orders
   * 获取订单列表
   */
  router.get('/orders', async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, symbol } = req.query;

      let orders = [];
      if (orderStore) {
        orders = await orderStore.getAll();

        if (status) {
          orders = orders.filter(o => o.status === status);
        }
        if (symbol) {
          orders = orders.filter(o => o.symbol === symbol);
        }
      }

      const total = orders.length;
      const offset = (page - 1) * pageSize;
      const list = orders.slice(offset, offset + parseInt(pageSize));

      res.json({
        success: true,
        data: list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/orders/open
   * 获取未完成订单
   */
  router.get('/orders/open', async (req, res) => {
    try {
      let orders = [];
      if (orderStore) {
        orders = await orderStore.getByStatus(['open', 'pending', 'partially_filled']);
      }

      res.json({ success: true, data: orders });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createTradeRoutes;
