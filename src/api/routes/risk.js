/**
 * RESTful API 路由 - 风控管理
 * Risk Management Routes
 *
 * @module src/api/routes/risk
 */

import { Router } from 'express';

/**
 * 创建风控管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createRiskRoutes(deps = {}) {
  const router = Router();
  const { riskManager, alertManager } = deps;

  /**
   * GET /api/risk/config
   * 获取风控配置
   */
  router.get('/config', async (req, res) => {
    try {
      let config = {
        maxLossPerTrade: 0.02,
        maxDailyLoss: 0.05,
        maxPositions: 10,
        maxPositionSize: 0.2,
        maxLeverage: 3,
        defaultStopLoss: 0.05,
        defaultTakeProfit: 0.1,
        enableTrailingStop: false,
        trailingStopDistance: 0.03,
        cooldownPeriod: 60000,
      };

      let state = {
        tradingAllowed: true,
        dailyPnL: 0,
        dailyTradeCount: 0,
        currentPositions: 0,
        consecutiveLosses: 0,
        lastTradeTime: null,
        triggerCount: 0,
      };

      if (riskManager) {
        config = riskManager.config || config;
        state = riskManager.state || state;
      }

      res.json({ success: true, data: { ...config, state } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/risk/config
   * 更新风控配置
   */
  router.put('/config', async (req, res) => {
    try {
      const updates = req.body;

      // 验证权限
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      // 验证参数范围
      const validations = {
        maxLossPerTrade: { min: 0.001, max: 0.5 },
        maxDailyLoss: { min: 0.01, max: 1 },
        maxPositions: { min: 1, max: 100 },
        maxPositionSize: { min: 0.01, max: 1 },
        maxLeverage: { min: 1, max: 125 },
        defaultStopLoss: { min: 0.001, max: 0.5 },
        defaultTakeProfit: { min: 0.001, max: 1 },
        trailingStopDistance: { min: 0.001, max: 0.5 },
        cooldownPeriod: { min: 0, max: 3600000 },
      };

      for (const [key, value] of Object.entries(updates)) {
        if (validations[key]) {
          const { min, max } = validations[key];
          if (typeof value === 'number' && (value < min || value > max)) {
            return res.status(400).json({
              success: false,
              error: `${key} must be between ${min} and ${max}`,
              code: 'VALIDATION_ERROR'
            });
          }
        }
      }

      if (riskManager?.updateConfig) {
        riskManager.updateConfig(updates);
      }

      res.json({ success: true, message: 'Risk configuration updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/risk/limits
   * 获取风控限制
   */
  router.get('/limits', async (req, res) => {
    try {
      let limits = {
        maxDailyTrades: 100,
        maxConsecutiveLosses: 5,
        maxOrderAmount: 10000,
        blacklistedSymbols: [],
      };

      if (riskManager?.getLimits) {
        limits = riskManager.getLimits();
      }

      res.json({ success: true, data: limits });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/risk/limits
   * 更新风控限制
   */
  router.put('/limits', async (req, res) => {
    try {
      const updates = req.body;

      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      if (riskManager?.updateLimits) {
        riskManager.updateLimits(updates);
      }

      res.json({ success: true, message: 'Risk limits updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/risk/alerts
   * 获取风控告警
   */
  router.get('/alerts', async (req, res) => {
    try {
      const { page = 1, pageSize = 50, level, dismissed } = req.query;

      let alerts = [];

      if (alertManager) {
        alerts = await alertManager.getAlerts();
      }

      // 过滤
      if (level) {
        alerts = alerts.filter(a => a.level === level);
      }
      if (dismissed !== undefined) {
        const isDismissed = dismissed === 'true';
        alerts = alerts.filter(a => a.dismissed === isDismissed);
      }

      // 分页
      const total = alerts.length;
      const offset = (page - 1) * pageSize;
      const list = alerts.slice(offset, offset + parseInt(pageSize));

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
   * POST /api/risk/alerts/:id/dismiss
   * 消除告警
   */
  router.post('/alerts/:id/dismiss', async (req, res) => {
    try {
      const { id } = req.params;

      if (alertManager?.dismissAlert) {
        await alertManager.dismissAlert(id);
      }

      res.json({ success: true, message: 'Alert dismissed' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/risk/trading/enable
   * 启用交易
   */
  router.post('/trading/enable', async (req, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      if (riskManager?.enableTrading) {
        riskManager.enableTrading();
      }

      res.json({ success: true, message: 'Trading enabled' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/risk/trading/disable
   * 禁用交易
   */
  router.post('/trading/disable', async (req, res) => {
    try {
      const { reason } = req.body;

      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      if (riskManager?.disableTrading) {
        riskManager.disableTrading(reason || 'Manual disable');
      }

      res.json({ success: true, message: 'Trading disabled' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createRiskRoutes;
