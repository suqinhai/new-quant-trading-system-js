/**
 * RESTful API 路由 - 策略管理
 * Strategy Management Routes
 *
 * @module src/api/routes/strategies
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建策略管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createStrategyRoutes(deps = {}) { // 导出函数 createStrategyRoutes
  const router = Router(); // 定义常量 router
  const { strategyStore, strategyRegistry, tradingEngine } = deps; // 解构赋值

  /**
   * GET /api/strategies
   * 获取策略列表
   */
  router.get('/', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { page = 1, pageSize = 20, status, keyword } = req.query; // 解构赋值

      let strategies = []; // 定义变量 strategies

      if (strategyStore) { // 条件判断 strategyStore
        strategies = await strategyStore.getAll(); // 赋值 strategies
      } // 结束代码块

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
      if (strategyStore) { // 条件判断 strategyStore
        strategy = await strategyStore.getById(id); // 赋值 strategy
      } // 结束代码块

      if (!strategy) { // 条件判断 !strategy
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Strategy not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: strategy }); // 调用 res.json
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

      if (strategyStore) { // 条件判断 strategyStore
        await strategyStore.save(strategy); // 等待异步结果
      } // 结束代码块

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
      if (strategyStore) { // 条件判断 strategyStore
        strategy = await strategyStore.getById(id); // 赋值 strategy
      } // 结束代码块

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

      if (strategyStore) { // 条件判断 strategyStore
        await strategyStore.save(updatedStrategy); // 等待异步结果
      } // 结束代码块

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
      if (strategyStore) { // 条件判断 strategyStore
        strategy = await strategyStore.getById(id); // 赋值 strategy
      } // 结束代码块

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

      if (strategyStore) { // 条件判断 strategyStore
        await strategyStore.delete(id); // 等待异步结果
      } // 结束代码块

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
      if (strategyStore) { // 条件判断 strategyStore
        strategy = await strategyStore.getById(id); // 赋值 strategy
      } // 结束代码块

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

      // 启动策略
      if (tradingEngine?.startStrategy) { // 条件判断 tradingEngine?.startStrategy
        await tradingEngine.startStrategy(id); // 等待异步结果
      } // 结束代码块

      if (strategyStore) { // 条件判断 strategyStore
        await strategyStore.updateState(id, 'running'); // 等待异步结果
      } // 结束代码块

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
      if (strategyStore) { // 条件判断 strategyStore
        strategy = await strategyStore.getById(id); // 赋值 strategy
      } // 结束代码块

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

      // 停止策略
      if (tradingEngine?.stopStrategy) { // 条件判断 tradingEngine?.stopStrategy
        await tradingEngine.stopStrategy(id); // 等待异步结果
      } // 结束代码块

      if (strategyStore) { // 条件判断 strategyStore
        await strategyStore.updateState(id, 'stopped'); // 等待异步结果
      } // 结束代码块

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

      let stats = null; // 定义变量 stats
      if (strategyStore) { // 条件判断 strategyStore
        stats = await strategyStore.getStats(id); // 赋值 stats
      } // 结束代码块

      if (!stats) { // 条件判断 !stats
        stats = { // 赋值 stats
          totalReturn: 0, // 总Return
          todayReturn: 0, // todayReturn
          trades: 0, // 成交
          winRate: 0, // win频率
          maxDrawdown: 0, // 最大回撤
          sharpeRatio: 0, // sharpe比例
          profitFactor: 0, // 盈利Factor
        }; // 结束代码块
      } // 结束代码块

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

      // 模拟回测结果
      const result = { // 定义常量 result
        strategyId: id, // 策略ID
        startDate, // 执行语句
        endDate, // 执行语句
        initialCapital: initialCapital || 10000, // 初始资金
        finalCapital: (initialCapital || 10000) * (1 + Math.random() * 0.5 - 0.1), // final资金
        totalReturn: Math.random() * 0.5 - 0.1, // 总Return
        maxDrawdown: Math.random() * 0.2, // 最大回撤
        sharpeRatio: Math.random() * 3, // sharpe比例
        trades: Math.floor(Math.random() * 100) + 10, // 成交
        winRate: Math.random() * 0.3 + 0.4, // win频率
        profitFactor: Math.random() * 2 + 0.5, // 盈利Factor
        completedAt: Date.now(), // completedAt
      }; // 结束代码块

      res.json({ success: true, data: result }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createStrategyRoutes; // 默认导出
