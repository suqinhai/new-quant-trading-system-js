/**
 * RESTful API 路由 - 策略管理
 * Strategy Management Routes
 *
 * @module src/api/routes/strategies
 */

import { Router } from 'express';

/**
 * 创建策略管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createStrategyRoutes(deps = {}) {
  const router = Router();
  const { strategyStore, strategyRegistry, tradingEngine } = deps;

  /**
   * GET /api/strategies
   * 获取策略列表
   */
  router.get('/', async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, keyword } = req.query;

      let strategies = [];

      if (strategyStore) {
        strategies = await strategyStore.getAll();
      }

      // 过滤
      if (status) {
        strategies = strategies.filter(s => s.state === status);
      }
      if (keyword) {
        const kw = keyword.toLowerCase();
        strategies = strategies.filter(s =>
          s.name?.toLowerCase().includes(kw) ||
          s.type?.toLowerCase().includes(kw)
        );
      }

      // 分页
      const total = strategies.length;
      const offset = (page - 1) * pageSize;
      const list = strategies.slice(offset, offset + parseInt(pageSize));

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
   * GET /api/strategies/types
   * 获取可用的策略类型
   */
  router.get('/types', async (req, res) => {
    try {
      const types = strategyRegistry?.getAvailableStrategies?.() || [
        'SMA', 'RSI', 'BollingerBands', 'MACD', 'Grid', 'FundingArb'
      ];

      res.json({ success: true, data: types });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/strategies/:id
   * 获取策略详情
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let strategy = null;
      if (strategyStore) {
        strategy = await strategyStore.getById(id);
      }

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({ success: true, data: strategy });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies
   * 创建策略
   */
  router.post('/', async (req, res) => {
    try {
      const { name, type, symbol, exchange, initialCapital, params } = req.body;

      // 验证必填字段
      if (!name || !type || !symbol) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, type, symbol',
          code: 'VALIDATION_ERROR'
        });
      }

      const strategy = {
        id: `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        type,
        symbol,
        exchange: exchange || 'binance',
        initialCapital: initialCapital || 10000,
        params: params || {},
        state: 'stopped',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: req.user?.sub || 'system',
        totalReturn: 0,
        todayReturn: 0,
        trades: 0,
        winRate: 0,
      };

      if (strategyStore) {
        await strategyStore.save(strategy);
      }

      res.status(201).json({ success: true, data: strategy });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/strategies/:id
   * 更新策略
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      let strategy = null;
      if (strategyStore) {
        strategy = await strategyStore.getById(id);
      }

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
          code: 'NOT_FOUND'
        });
      }

      // 运行中的策略不能修改
      if (strategy.state === 'running') {
        return res.status(400).json({
          success: false,
          error: 'Cannot update running strategy. Stop it first.',
          code: 'STRATEGY_RUNNING'
        });
      }

      // 更新字段
      const updatedStrategy = {
        ...strategy,
        ...updates,
        id, // 防止修改 ID
        updatedAt: Date.now(),
      };

      if (strategyStore) {
        await strategyStore.save(updatedStrategy);
      }

      res.json({ success: true, data: updatedStrategy });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/strategies/:id
   * 删除策略
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let strategy = null;
      if (strategyStore) {
        strategy = await strategyStore.getById(id);
      }

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
          code: 'NOT_FOUND'
        });
      }

      // 运行中的策略不能删除
      if (strategy.state === 'running') {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete running strategy. Stop it first.',
          code: 'STRATEGY_RUNNING'
        });
      }

      if (strategyStore) {
        await strategyStore.delete(id);
      }

      res.json({ success: true, message: 'Strategy deleted' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies/:id/start
   * 启动策略
   */
  router.post('/:id/start', async (req, res) => {
    try {
      const { id } = req.params;

      let strategy = null;
      if (strategyStore) {
        strategy = await strategyStore.getById(id);
      }

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
          code: 'NOT_FOUND'
        });
      }

      if (strategy.state === 'running') {
        return res.status(400).json({
          success: false,
          error: 'Strategy is already running',
          code: 'ALREADY_RUNNING'
        });
      }

      // 启动策略
      if (tradingEngine?.startStrategy) {
        await tradingEngine.startStrategy(id);
      }

      if (strategyStore) {
        await strategyStore.updateState(id, 'running');
      }

      res.json({ success: true, message: 'Strategy started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies/:id/stop
   * 停止策略
   */
  router.post('/:id/stop', async (req, res) => {
    try {
      const { id } = req.params;

      let strategy = null;
      if (strategyStore) {
        strategy = await strategyStore.getById(id);
      }

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
          code: 'NOT_FOUND'
        });
      }

      if (strategy.state !== 'running') {
        return res.status(400).json({
          success: false,
          error: 'Strategy is not running',
          code: 'NOT_RUNNING'
        });
      }

      // 停止策略
      if (tradingEngine?.stopStrategy) {
        await tradingEngine.stopStrategy(id);
      }

      if (strategyStore) {
        await strategyStore.updateState(id, 'stopped');
      }

      res.json({ success: true, message: 'Strategy stopped' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/strategies/:id/stats
   * 获取策略统计
   */
  router.get('/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;

      let stats = null;
      if (strategyStore) {
        stats = await strategyStore.getStats(id);
      }

      if (!stats) {
        stats = {
          totalReturn: 0,
          todayReturn: 0,
          trades: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          profitFactor: 0,
        };
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies/:id/backtest
   * 执行回测
   */
  router.post('/:id/backtest', async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate, initialCapital } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: startDate, endDate',
          code: 'VALIDATION_ERROR'
        });
      }

      // 模拟回测结果
      const result = {
        strategyId: id,
        startDate,
        endDate,
        initialCapital: initialCapital || 10000,
        finalCapital: (initialCapital || 10000) * (1 + Math.random() * 0.5 - 0.1),
        totalReturn: Math.random() * 0.5 - 0.1,
        maxDrawdown: Math.random() * 0.2,
        sharpeRatio: Math.random() * 3,
        trades: Math.floor(Math.random() * 100) + 10,
        winRate: Math.random() * 0.3 + 0.4,
        profitFactor: Math.random() * 2 + 0.5,
        completedAt: Date.now(),
      };

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createStrategyRoutes;
