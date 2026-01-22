/**
 * RESTful API 路由 - 持仓管理
 * Position Management Routes
 *
 * @module src/api/routes/positions
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建持仓管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createPositionRoutes(deps = {}) { // 导出函数 createPositionRoutes
  const router = Router(); // 定义常量 router
  const { positionStore, tradingEngine } = deps; // 解构赋值

  /**
   * GET /api/positions
   * 获取持仓列表
   */
  router.get('/', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { symbol, exchange, minValue } = req.query; // 解构赋值

      let positions = []; // 定义变量 positions

      if (positionStore) { // 条件判断 positionStore
        positions = await positionStore.getAll(); // 赋值 positions
      } // 结束代码块

      // 过滤
      if (symbol) { // 条件判断 symbol
        positions = positions.filter(p => p.symbol === symbol); // 赋值 positions
      } // 结束代码块
      if (exchange) { // 条件判断 exchange
        positions = positions.filter(p => p.exchange === exchange); // 赋值 positions
      } // 结束代码块
      if (minValue) { // 条件判断 minValue
        positions = positions.filter(p => (p.currentValue || 0) >= parseFloat(minValue)); // 赋值 positions
      } // 结束代码块

      res.json({ success: true, data: positions }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/positions/:id
   * 获取持仓详情
   */
  router.get('/:id', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let position = null; // 定义变量 position
      if (positionStore) { // 条件判断 positionStore
        position = await positionStore.getById(id); // 赋值 position
      } // 结束代码块

      if (!position) { // 条件判断 !position
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Position not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: position }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/positions/:id/close
   * 平仓
   */
  router.post('/:id/close', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { id } = req.params; // 解构赋值
      const { percentage = 100 } = req.body; // 解构赋值

      // 验证权限
      if (req.user?.role !== 'admin' && req.user?.role !== 'trader') { // 条件判断 req.user?.role !== 'admin' && req.user?.role ...
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Trader or admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      let position = null; // 定义变量 position
      if (positionStore) { // 条件判断 positionStore
        position = await positionStore.getById(id); // 赋值 position
      } // 结束代码块

      if (!position) { // 条件判断 !position
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Position not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 执行平仓
      if (tradingEngine?.closePosition) { // 条件判断 tradingEngine?.closePosition
        await tradingEngine.closePosition(id, percentage); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: `Position ${percentage}% closed` }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/positions/close-all
   * 全部平仓
   */
  router.post('/close-all', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { exchange, symbol } = req.body; // 解构赋值

      // 验证权限
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      let positions = []; // 定义变量 positions
      if (positionStore) { // 条件判断 positionStore
        positions = await positionStore.getAll(); // 赋值 positions
      } // 结束代码块

      // 过滤
      if (exchange) { // 条件判断 exchange
        positions = positions.filter(p => p.exchange === exchange); // 赋值 positions
      } // 结束代码块
      if (symbol) { // 条件判断 symbol
        positions = positions.filter(p => p.symbol === symbol); // 赋值 positions
      } // 结束代码块

      // 执行平仓
      let closedCount = 0; // 定义变量 closedCount
      if (tradingEngine?.closePosition) { // 条件判断 tradingEngine?.closePosition
        for (const position of positions) { // 循环 const position of positions
          await tradingEngine.closePosition(position.id, 100); // 等待异步结果
          closedCount++; // 执行语句
        } // 结束代码块
      } // 结束代码块

      res.json({ // 调用 res.json
        success: true, // 成功标记
        message: `${closedCount} positions closed`, // 消息
        data: { closedCount } // 数据
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/positions/summary
   * 获取持仓汇总
   */
  router.get('/summary', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let positions = []; // 定义变量 positions
      if (positionStore) { // 条件判断 positionStore
        positions = await positionStore.getAll(); // 赋值 positions
      } // 结束代码块

      const summary = { // 定义常量 summary
        totalPositions: positions.length, // 总持仓
        totalValue: 0, // 总Value
        totalUnrealizedPnL: 0, // 总未实现PnL
        byExchange: {}, // by交易所
        bySymbol: {}, // by交易对
      }; // 结束代码块

      for (const position of positions) { // 循环 const position of positions
        summary.totalValue += position.currentValue || 0; // 执行语句
        summary.totalUnrealizedPnL += position.unrealizedPnL || 0; // 执行语句

        // 按交易所统计
        const exchange = position.exchange || 'unknown'; // 定义常量 exchange
        if (!summary.byExchange[exchange]) { // 条件判断 !summary.byExchange[exchange]
          summary.byExchange[exchange] = { count: 0, value: 0, pnl: 0 }; // 执行语句
        } // 结束代码块
        summary.byExchange[exchange].count++; // 执行语句
        summary.byExchange[exchange].value += position.currentValue || 0; // 执行语句
        summary.byExchange[exchange].pnl += position.unrealizedPnL || 0; // 执行语句

        // 按交易对统计
        const symbol = position.symbol || 'unknown'; // 定义常量 symbol
        if (!summary.bySymbol[symbol]) { // 条件判断 !summary.bySymbol[symbol]
          summary.bySymbol[symbol] = { count: 0, value: 0, pnl: 0 }; // 执行语句
        } // 结束代码块
        summary.bySymbol[symbol].count++; // 执行语句
        summary.bySymbol[symbol].value += position.currentValue || 0; // 执行语句
        summary.bySymbol[symbol].pnl += position.unrealizedPnL || 0; // 执行语句
      } // 结束代码块

      res.json({ success: true, data: summary }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createPositionRoutes; // 默认导出
