/**
 * RESTful API 路由 - 持仓管理
 * Position Management Routes
 *
 * @module src/api/routes/positions
 */

import { Router } from 'express';

/**
 * 创建持仓管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createPositionRoutes(deps = {}) {
  const router = Router();
  const { positionStore, tradingEngine } = deps;

  /**
   * GET /api/positions
   * 获取持仓列表
   */
  router.get('/', async (req, res) => {
    try {
      const { symbol, exchange, minValue } = req.query;

      let positions = [];

      if (positionStore) {
        positions = await positionStore.getAll();
      }

      // 过滤
      if (symbol) {
        positions = positions.filter(p => p.symbol === symbol);
      }
      if (exchange) {
        positions = positions.filter(p => p.exchange === exchange);
      }
      if (minValue) {
        positions = positions.filter(p => (p.currentValue || 0) >= parseFloat(minValue));
      }

      res.json({ success: true, data: positions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/positions/:id
   * 获取持仓详情
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let position = null;
      if (positionStore) {
        position = await positionStore.getById(id);
      }

      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({ success: true, data: position });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/positions/:id/close
   * 平仓
   */
  router.post('/:id/close', async (req, res) => {
    try {
      const { id } = req.params;
      const { percentage = 100 } = req.body;

      // 验证权限
      if (req.user?.role !== 'admin' && req.user?.role !== 'trader') {
        return res.status(403).json({
          success: false,
          error: 'Trader or admin permission required',
          code: 'FORBIDDEN'
        });
      }

      let position = null;
      if (positionStore) {
        position = await positionStore.getById(id);
      }

      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found',
          code: 'NOT_FOUND'
        });
      }

      // 执行平仓
      if (tradingEngine?.closePosition) {
        await tradingEngine.closePosition(id, percentage);
      }

      res.json({ success: true, message: `Position ${percentage}% closed` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/positions/close-all
   * 全部平仓
   */
  router.post('/close-all', async (req, res) => {
    try {
      const { exchange, symbol } = req.body;

      // 验证权限
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      let positions = [];
      if (positionStore) {
        positions = await positionStore.getAll();
      }

      // 过滤
      if (exchange) {
        positions = positions.filter(p => p.exchange === exchange);
      }
      if (symbol) {
        positions = positions.filter(p => p.symbol === symbol);
      }

      // 执行平仓
      let closedCount = 0;
      if (tradingEngine?.closePosition) {
        for (const position of positions) {
          await tradingEngine.closePosition(position.id, 100);
          closedCount++;
        }
      }

      res.json({
        success: true,
        message: `${closedCount} positions closed`,
        data: { closedCount }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/positions/summary
   * 获取持仓汇总
   */
  router.get('/summary', async (req, res) => {
    try {
      let positions = [];
      if (positionStore) {
        positions = await positionStore.getAll();
      }

      const summary = {
        totalPositions: positions.length,
        totalValue: 0,
        totalUnrealizedPnL: 0,
        byExchange: {},
        bySymbol: {},
      };

      for (const position of positions) {
        summary.totalValue += position.currentValue || 0;
        summary.totalUnrealizedPnL += position.unrealizedPnL || 0;

        // 按交易所统计
        const exchange = position.exchange || 'unknown';
        if (!summary.byExchange[exchange]) {
          summary.byExchange[exchange] = { count: 0, value: 0, pnl: 0 };
        }
        summary.byExchange[exchange].count++;
        summary.byExchange[exchange].value += position.currentValue || 0;
        summary.byExchange[exchange].pnl += position.unrealizedPnL || 0;

        // 按交易对统计
        const symbol = position.symbol || 'unknown';
        if (!summary.bySymbol[symbol]) {
          summary.bySymbol[symbol] = { count: 0, value: 0, pnl: 0 };
        }
        summary.bySymbol[symbol].count++;
        summary.bySymbol[symbol].value += position.currentValue || 0;
        summary.bySymbol[symbol].pnl += position.unrealizedPnL || 0;
      }

      res.json({ success: true, data: summary });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createPositionRoutes;
