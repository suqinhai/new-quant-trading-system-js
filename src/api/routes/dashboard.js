/**
 * RESTful API 路由 - 仪表板
 * Dashboard Routes
 *
 * @module src/api/routes/dashboard
 */

import { Router } from 'express';

/**
 * 创建仪表板路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createDashboardRoutes(deps = {}) {
  const router = Router();
  const { dashboardService, tradeRepository, positionStore, alertManager } = deps;

  /**
   * GET /api/dashboard/summary
   * 获取仪表板摘要
   */
  router.get('/summary', async (req, res) => {
    try {
      let summary = {
        totalAssets: 0,
        availableBalance: 0,
        positionValue: 0,
        todayPnL: 0,
        todayPnLPercent: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        runningStrategies: 0,
        totalStrategies: 0,
        openPositions: 0,
        todayTrades: 0,
      };

      if (dashboardService?.getSummary) {
        summary = await dashboardService.getSummary();
      }

      res.json({ success: true, data: summary });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/dashboard/pnl
   * 获取盈亏数据
   */
  router.get('/pnl', async (req, res) => {
    try {
      const { period = '7d' } = req.query;

      let pnlData = {
        dates: [],
        values: [],
        cumulative: [],
      };

      if (dashboardService?.getPnLHistory) {
        pnlData = await dashboardService.getPnLHistory(period);
      } else {
        // 模拟数据
        const days = period === '1d' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const now = Date.now();
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now - i * 24 * 60 * 60 * 1000);
          pnlData.dates.push(date.toISOString().split('T')[0]);
          pnlData.values.push(Math.random() * 1000 - 200);
        }
        let cum = 0;
        pnlData.cumulative = pnlData.values.map(v => (cum += v));
      }

      res.json({ success: true, data: pnlData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/dashboard/recent-trades
   * 获取最近交易
   */
  router.get('/recent-trades', async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      let trades = [];

      if (tradeRepository) {
        const result = await tradeRepository.getTradeHistory({
          limit: parseInt(limit),
          sortBy: 'timestamp',
          sortOrder: 'desc',
        });
        trades = result.trades || [];
      }

      res.json({ success: true, data: trades });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/dashboard/alerts
   * 获取告警
   */
  router.get('/alerts', async (req, res) => {
    try {
      const { limit = 5 } = req.query;

      let alerts = [];

      if (alertManager) {
        alerts = await alertManager.getAlerts();
        alerts = alerts.filter(a => !a.dismissed).slice(0, parseInt(limit));
      }

      res.json({ success: true, data: alerts });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/dashboard/positions
   * 获取持仓摘要
   */
  router.get('/positions', async (req, res) => {
    try {
      let positions = [];

      if (positionStore) {
        positions = await positionStore.getAll();
      }

      // 计算持仓摘要
      const summary = {
        total: positions.length,
        totalValue: positions.reduce((sum, p) => sum + (p.currentValue || 0), 0),
        totalPnL: positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0),
        positions: positions.slice(0, 10), // 只返回前10个
      };

      res.json({ success: true, data: summary });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/dashboard/system-metrics
   * 获取系统指标
   */
  router.get('/system-metrics', async (req, res) => {
    try {
      const memory = process.memoryUsage();
      const metrics = {
        cpu: {
          usage: Math.random() * 30 + 10, // 模拟 CPU 使用率
        },
        memory: {
          used: memory.heapUsed,
          total: memory.heapTotal,
          percent: (memory.heapUsed / memory.heapTotal) * 100,
        },
        uptime: process.uptime(),
        latency: Math.random() * 50 + 10, // 模拟延迟
        timestamp: Date.now(),
      };

      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createDashboardRoutes;
