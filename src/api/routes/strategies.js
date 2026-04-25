/**
 * RESTful API 路由 - 策略管理
 * Strategy Management Routes
 *
 * @module src/api/routes/strategies
 */

import { Router } from 'express'; // 导入模块 express

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function createMemoryStrategyStore() {
  const strategies = new Map();
  const stats = new Map();

  return {
    async getAll() {
      return Array.from(strategies.values()).map(deepClone);
    },

    async getById(id) {
      return deepClone(strategies.get(id)) || null;
    },

    async save(strategy) {
      const strategyId = strategy.strategyId || strategy.id;
      if (!strategyId) {
        throw new Error('Strategy ID is required');
      }

      strategies.set(strategyId, deepClone({
        ...strategy,
        strategyId,
        updatedAt: Date.now(),
      }));

      return { strategyId, changes: 1 };
    },

    async delete(id) {
      strategies.delete(id);
      stats.delete(id);
      return { changes: 1 };
    },

    async updateState(id, state) {
      const strategy = strategies.get(id);
      if (!strategy) {
        throw new Error(`Strategy not found: ${id}`);
      }

      strategies.set(id, {
        ...strategy,
        state,
        updatedAt: Date.now(),
      });

      return { strategyId: id, state };
    },

    async getStats(id) {
      return deepClone(stats.get(id)) || null;
    },

    async updateStats(id, value) {
      stats.set(id, deepClone(value));
      return { strategyId: id };
    },
  };
}

/**
 * 创建策略管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createStrategyRoutes(deps = {}) { // 导出函数 createStrategyRoutes
  const router = Router(); // 定义常量 router
  const { strategyStore, strategyRegistry, tradingEngine, tradeRepository, backtestService } = deps; // 解构赋值
  const store = strategyStore || createMemoryStrategyStore();

  const normalizeStrategy = (strategy = {}) => { // 定义函数 normalizeStrategy
    const config = strategy.config || {}; // 定义常量 config
    const stateData = strategy.stateData || {}; // 定义常量 stateData
    const params = strategy.parameters || strategy.params || {}; // 定义常量 params

    return { // 返回结果
      id: strategy.id || strategy.strategyId, // ID
      name: strategy.name || strategy.strategyName || config.name || stateData.name || strategy.id || strategy.strategyId, // name
      type: strategy.type || config.type || stateData.type || strategy.strategyName || 'Unknown', // type
      symbol: strategy.symbol || config.symbol || stateData.symbol || '', // symbol
      exchange: strategy.exchange || config.exchange || stateData.exchange || 'binance', // exchange
      initialCapital: Number(
        strategy.initialCapital
        ?? config.initialCapital
        ?? stateData.initialCapital
        ?? 10000
      ), // initialCapital
      params, // params
      state: strategy.state || 'stopped', // state
      createdAt: strategy.createdAt || Date.now(), // createdAt
      updatedAt: strategy.updatedAt || Date.now(), // updatedAt
      totalReturn: Number(stateData.totalReturn ?? strategy.totalReturn ?? 0), // totalReturn
      todayReturn: Number(stateData.todayReturn ?? strategy.todayReturn ?? 0), // todayReturn
      trades: Number(stateData.trades ?? strategy.trades ?? 0), // trades
      winRate: Number(stateData.winRate ?? strategy.winRate ?? 0), // winRate
      lastSignal: strategy.lastSignal || null, // lastSignal
      lastSignalTime: strategy.lastSignalTime || null, // lastSignalTime
    }; // 结束代码块
  }; // 结束代码块

  const toStorePayload = (strategy = {}) => { // 定义函数 toStorePayload
    const normalized = normalizeStrategy(strategy); // 定义常量 normalized

    return { // 返回结果
      strategyId: normalized.id, // strategyId
      strategyName: normalized.name, // strategyName
      state: normalized.state, // state
      config: { // config
        name: normalized.name, // name
        type: normalized.type, // type
        symbol: normalized.symbol, // symbol
        exchange: normalized.exchange, // exchange
        initialCapital: normalized.initialCapital, // initialCapital
      }, // 结束代码块
      parameters: normalized.params || {}, // parameters
      stateData: { // stateData
        totalReturn: normalized.totalReturn, // totalReturn
        todayReturn: normalized.todayReturn, // todayReturn
        trades: normalized.trades, // trades
        winRate: normalized.winRate, // winRate
      }, // 结束代码块
      lastSignal: normalized.lastSignal, // lastSignal
      lastSignalTime: normalized.lastSignalTime, // lastSignalTime
      createdAt: normalized.createdAt, // createdAt
      updatedAt: normalized.updatedAt, // updatedAt
    }; // 结束代码块
  }; // 结束代码块

  const buildStrategyStats = async (strategyId) => { // 定义函数 buildStrategyStats
    const storedStats = await store?.getStats?.(strategyId); // 定义常量 storedStats
    const strategy = await store?.getById?.(strategyId); // 定义常量 strategy
    const capital = normalizeStrategy(strategy || {}).initialCapital || 10000; // 定义常量 capital
    const result = { // 定义常量 result
      totalReturn: Number(storedStats?.totalReturn || 0), // totalReturn
      todayReturn: Number(storedStats?.todayReturn || 0), // todayReturn
      trades: Number(storedStats?.trades || 0), // trades
      winRate: Number(storedStats?.winRate || 0), // winRate
      maxDrawdown: Number(storedStats?.maxDrawdown || 0), // maxDrawdown
      sharpeRatio: Number(storedStats?.sharpeRatio || 0), // sharpeRatio
      profitFactor: Number(storedStats?.profitFactor || 0), // profitFactor
    }; // 结束代码块

    if (!tradeRepository?.getTradeStats) { // 条件判断 !tradeRepository?.getTradeStats
      return result; // 返回结果
    } // 结束代码块

    const tradeStats = await tradeRepository.getTradeStats({ strategy: strategyId }); // 定义常量 tradeStats
    result.trades = Number(tradeStats.totalTrades || 0); // 赋值 result.trades
    result.winRate = Number(tradeStats.winRate || 0); // 赋值 result.winRate
    result.totalReturn = capital > 0 ? Number(tradeStats.totalPnL || 0) / capital : 0; // 赋值 result.totalReturn
    result.todayReturn = capital > 0 ? Number(tradeStats.totalPnL || 0) / capital : 0; // 赋值 result.todayReturn
    result.profitFactor = tradeStats.avgLoss < 0 // 赋值 result.profitFactor
      ? Math.abs(Number(tradeStats.avgWin || 0) / Number(tradeStats.avgLoss || 1))
      : Number(result.profitFactor || 0); // profitFactor

    return result; // 返回结果
  }; // 结束代码块

  /**
   * GET /api/strategies
   * 获取策略列表
   */
  router.get('/', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { page = 1, pageSize = 20, status, keyword } = req.query; // 解构赋值

      let strategies = []; // 定义变量 strategies

      strategies = await store.getAll(); // 赋值 strategies

      strategies = strategies
        .map(normalizeStrategy)
        .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0)); // 赋值 strategies

      // 过滤
      if (status) { // 条件判断 status
        strategies = strategies.filter(s => s.state === status); // 赋值 strategies
      } // 结束代码块
      if (keyword) { // 条件判断 keyword
        const kw = keyword.toLowerCase(); // 定义常量 kw
        strategies = strategies.filter(s => // 赋值 strategies
          s.name?.toLowerCase().includes(kw) || // 执行语句
          s.type?.toLowerCase().includes(kw) // 执行语句
        ); // 结束调用或参数
      } // 结束代码块

      // 分页
      const total = strategies.length; // 定义常量 total
      const offset = (page - 1) * pageSize; // 定义常量 offset
      const list = strategies.slice(offset, offset + parseInt(pageSize)); // 定义常量 list

      res.json({ // 调用 res.json
        success: true, // 成功标记
        data: list, // 数据
        total, // 执行语句
        page: parseInt(page), // page
        pageSize: parseInt(pageSize), // page大小
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/strategies/types
   * 获取可用的策略类型
   */
  router.get('/types', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const types = strategyRegistry?.getAvailableStrategies?.() || [ // 定义常量 types
        'SMA', 'RSI', 'BollingerBands', 'MACD', 'Grid', 'FundingArb', // 执行语句
        'ATRBreakout', 'BollingerWidth', 'VolatilityRegime', 'RegimeSwitching', // 执行语句
        'OrderFlow', 'MultiTimeframe', 'WeightedCombo', 'Adaptive' // 执行语句
      ]; // 结束数组或索引

      res.json({ success: true, data: types }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/strategies/:id
   * 获取策略详情
   */
  router.get('/:id', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let strategy = null; // 定义变量 strategy
      strategy = await store.getById(id); // 赋值 strategy

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: normalizeStrategy(strategy) }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/strategies
   * 创建策略
   */
  router.post('/', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { name, type, symbol, exchange, initialCapital, params } = req.body; // 解构赋值

      // 验证必填字段
      if (!name || !type || !symbol) { // 条件判断 !name || !type || !symbol
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Missing required fields: name, type, symbol', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      const strategy = { // 定义常量 strategy
        id: `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // ID
        name, // 执行语句
        type, // 执行语句
        symbol, // 执行语句
        exchange: exchange || 'binance', // 交易所
        initialCapital: initialCapital || 10000, // 初始资金
        params: params || {}, // params
        state: 'stopped', // state
        createdAt: Date.now(), // createdAt
        updatedAt: Date.now(), // updatedAt
        createdBy: req.user?.sub || 'system', // createdBy
        totalReturn: 0, // 总Return
        todayReturn: 0, // todayReturn
        trades: 0, // 成交
        winRate: 0, // win频率
      }; // 结束代码块

      await store.save(toStorePayload(strategy)); // 等待异步结果

      res.status(201).json({ success: true, data: strategy }); // 调用 res.status
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * PUT /api/strategies/:id
   * 更新策略
   */
  router.put('/:id', async (req, res) => { // 调用 router.put
    try { // 尝试执行
      const { id } = req.params; // 解构赋值
      const updates = req.body; // 定义常量 updates

      let strategy = null; // 定义变量 strategy
      strategy = await store.getById(id); // 赋值 strategy

      strategy = strategy ? normalizeStrategy(strategy) : null; // 赋值 strategy

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 运行中的策略不能修改
      if (strategy.state === 'running') { // 条件判断 strategy.state === 'running'
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Cannot update running strategy. Stop it first.', // 错误
          code: 'STRATEGY_RUNNING' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 更新字段
      const updatedStrategy = { // 定义常量 updatedStrategy
        ...strategy, // 展开对象或数组
        ...updates, // 展开对象或数组
        id, // 防止修改 ID
        updatedAt: Date.now(), // updatedAt
      }; // 结束代码块

      await store.save(toStorePayload(updatedStrategy)); // 等待异步结果

      res.json({ success: true, data: updatedStrategy }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * DELETE /api/strategies/:id
   * 删除策略
   */
  router.delete('/:id', async (req, res) => { // 调用 router.delete
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let strategy = null; // 定义变量 strategy
      strategy = await store.getById(id); // 赋值 strategy

      strategy = strategy ? normalizeStrategy(strategy) : null; // 赋值 strategy

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 运行中的策略不能删除
      if (strategy.state === 'running') { // 条件判断 strategy.state === 'running'
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Cannot delete running strategy. Stop it first.', // 错误
          code: 'STRATEGY_RUNNING' // 代码
        }); // 结束代码块
      } // 结束代码块

      await store.delete(id); // 等待异步结果

      res.json({ success: true, message: 'Strategy deleted' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/strategies/:id/start
   * 启动策略
   */
  router.post('/:id/start', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let strategy = null; // 定义变量 strategy
      strategy = await store.getById(id); // 赋值 strategy

      strategy = strategy ? normalizeStrategy(strategy) : null; // 赋值 strategy

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (strategy.state === 'running') { // 条件判断 strategy.state === 'running'
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy is already running', // 错误
          code: 'ALREADY_RUNNING' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (!tradingEngine?.startStrategy) { // 条件判断 !tradingEngine?.startStrategy
        return res.status(503).json({ // 返回结果
          success: false, // 成功标记
          error: 'Runtime strategy control is unavailable', // 错误
          code: 'SERVICE_UNAVAILABLE' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 启动策略
      await tradingEngine.startStrategy(id); // 等待异步结果

      await store.updateState(id, 'running'); // 等待异步结果

      res.json({ success: true, message: 'Strategy started' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/strategies/:id/stop
   * 停止策略
   */
  router.post('/:id/stop', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let strategy = null; // 定义变量 strategy
      strategy = await store.getById(id); // 赋值 strategy

      strategy = strategy ? normalizeStrategy(strategy) : null; // 赋值 strategy

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (strategy.state !== 'running') { // 条件判断 strategy.state !== 'running'
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy is not running', // 错误
          code: 'NOT_RUNNING' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (!tradingEngine?.stopStrategy) { // 条件判断 !tradingEngine?.stopStrategy
        return res.status(503).json({ // 返回结果
          success: false, // 成功标记
          error: 'Runtime strategy control is unavailable', // 错误
          code: 'SERVICE_UNAVAILABLE' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 停止策略
      await tradingEngine.stopStrategy(id); // 等待异步结果

      await store.updateState(id, 'stopped'); // 等待异步结果

      res.json({ success: true, message: 'Strategy stopped' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/strategies/:id/stats
   * 获取策略统计
   */
  router.get('/:id/stats', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      const stats = await buildStrategyStats(id); // 定义常量 stats

      res.json({ success: true, data: stats }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/strategies/:id/backtest
   * 执行回测
   */
  router.post('/:id/backtest', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { id } = req.params; // 解构赋值
      const { startDate, endDate, initialCapital } = req.body; // 解构赋值

      if (!startDate || !endDate) { // 条件判断 !startDate || !endDate
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Missing required fields: startDate, endDate', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (!backtestService?.run && !tradingEngine?.runBacktest) { // 条件判断
        return res.status(503).json({ // 返回结果
          success: false, // 成功标记
          error: 'Backtest service is not available in the current runtime', // 错误
          code: 'SERVICE_UNAVAILABLE' // 代码
        }); // 结束代码块
      } // 结束代码块

      const result = backtestService?.run // 定义常量 result
        ? await backtestService.run({ strategyId: id, startDate, endDate, initialCapital }) // 等待异步结果
        : await tradingEngine.runBacktest({ strategyId: id, startDate, endDate, initialCapital }); // 等待异步结果

      res.json({ success: true, data: result }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createStrategyRoutes; // 默认导出
