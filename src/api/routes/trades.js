/**
 * RESTful API 路由 - 交易记录
 * Trade Records Routes
 *
 * @module src/api/routes/trades
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建交易记录路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createTradeRoutes(deps = {}) { // 导出函数 createTradeRoutes
  const router = Router(); // 定义常量 router
  const { tradeRepository, orderStore } = deps; // 解构赋值

  /**
   * GET /api/trades
   * 获取交易列表
   */
  router.get('/', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { // 解构赋值
        page = 1, // 赋值 page
        pageSize = 20, // 赋值 pageSize
        symbol, // 执行语句
        side, // 执行语句
        strategy, // 执行语句
        startDate, // 执行语句
        endDate, // 执行语句
        sortBy = 'timestamp', // 赋值 sortBy
        sortOrder = 'desc' // 赋值 sortOrder
      } = req.query; // 执行语句

      let trades = []; // 定义变量 trades
      let total = 0; // 定义变量 total

      if (tradeRepository) { // 条件判断 tradeRepository
        const result = await tradeRepository.getTradeHistory({ // 定义常量 result
          symbol, // 执行语句
          side, // 执行语句
          strategy, // 执行语句
          startDate, // 执行语句
          endDate, // 执行语句
          limit: parseInt(pageSize), // 限制
          offset: (page - 1) * pageSize, // offset
          sortBy, // 执行语句
          sortOrder, // 执行语句
        }); // 结束代码块
        trades = result.trades || []; // 赋值 trades
        total = result.total || trades.length; // 赋值 total
      } // 结束代码块

      res.json({ // 调用 res.json
        success: true, // 成功标记
        data: trades, // 数据
        total, // 执行语句
        page: parseInt(page), // page
        pageSize: parseInt(pageSize), // page大小
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/trades/stats
   * 获取交易统计
   */
  router.get('/stats', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { startDate, endDate, symbol, strategy } = req.query; // 解构赋值

      let stats = { // 定义变量 stats
        totalTrades: 0, // 总成交
        buyCount: 0, // buy数量
        sellCount: 0, // sell数量
        totalVolume: 0, // 总成交量
        totalFees: 0, // 总Fees
        totalPnL: 0, // 总PnL
        winCount: 0, // win数量
        lossCount: 0, // 亏损数量
        winRate: 0, // win频率
        avgPnL: 0, // avgPnL
        avgWin: 0, // avgWin
        avgLoss: 0, // avg亏损
      }; // 结束代码块

      if (tradeRepository) { // 条件判断 tradeRepository
        stats = await tradeRepository.getTradeStats({ // 赋值 stats
          startDate, // 执行语句
          endDate, // 执行语句
          symbol, // 执行语句
          strategy, // 执行语句
        }); // 结束代码块
      } // 结束代码块

      // 计算衍生指标
      if (stats.totalTrades > 0) { // 条件判断 stats.totalTrades > 0
        stats.winRate = stats.winCount / stats.totalTrades; // 赋值 stats.winRate
        stats.avgPnL = stats.totalPnL / stats.totalTrades; // 赋值 stats.avgPnL
      } // 结束代码块

      res.json({ success: true, data: stats }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/trades/:id
   * 获取交易详情
   */
  router.get('/:id', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      let trade = null; // 定义变量 trade
      if (tradeRepository) { // 条件判断 tradeRepository
        trade = await tradeRepository.getById(id); // 赋值 trade
      } // 结束代码块

      if (!trade) { // 条件判断 !trade
        return res.status(404).json({ // 返回结果
          success: false, // 成功标记
          error: 'Trade not found', // 错误
          code: 'NOT_FOUND' // 代码
        }); // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: trade }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/trades/export
   * 导出交易数据
   */
  router.get('/export', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { format = 'csv', startDate, endDate, symbol, strategy } = req.query; // 解构赋值

      let trades = []; // 定义变量 trades
      if (tradeRepository) { // 条件判断 tradeRepository
        const result = await tradeRepository.getTradeHistory({ // 定义常量 result
          startDate, // 执行语句
          endDate, // 执行语句
          symbol, // 执行语句
          strategy, // 执行语句
          limit: 10000, // 限制
        }); // 结束代码块
        trades = result.trades || []; // 赋值 trades
      } // 结束代码块

      if (format === 'csv') { // 条件判断 format === 'csv'
        // 生成 CSV
        const headers = ['时间', '交易ID', '交易对', '方向', '类型', '数量', '价格', '金额', '手续费', '盈亏', '策略', '交易所']; // 定义常量 headers
        const rows = trades.map(t => [ // 定义函数 rows
          new Date(t.timestamp).toISOString(), // 创建 Date 实例
          t.tradeId, // 执行语句
          t.symbol, // 执行语句
          t.side, // 执行语句
          t.type, // 执行语句
          t.amount, // 执行语句
          t.price, // 执行语句
          t.cost, // 执行语句
          t.fee, // 执行语句
          t.realizedPnL || '', // 执行语句
          t.strategy || '', // 执行语句
          t.exchange, // 执行语句
        ]); // 结束数组或索引

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n'); // 定义函数 csv

        res.setHeader('Content-Type', 'text/csv; charset=utf-8'); // 调用 res.setHeader
        res.setHeader('Content-Disposition', `attachment; filename=trades_${Date.now()}.csv`); // 调用 res.setHeader
        res.send('\uFEFF' + csv); // BOM for Excel
      } else { // 执行语句
        res.json({ success: true, data: trades }); // 调用 res.json
      } // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/orders
   * 获取订单列表
   */
  router.get('/orders', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { page = 1, pageSize = 20, status, symbol } = req.query; // 解构赋值

      let orders = []; // 定义变量 orders
      if (orderStore) { // 条件判断 orderStore
        orders = await orderStore.getAll(); // 赋值 orders

        if (status) { // 条件判断 status
          orders = orders.filter(o => o.status === status); // 赋值 orders
        } // 结束代码块
        if (symbol) { // 条件判断 symbol
          orders = orders.filter(o => o.symbol === symbol); // 赋值 orders
        } // 结束代码块
      } // 结束代码块

      const total = orders.length; // 定义常量 total
      const offset = (page - 1) * pageSize; // 定义常量 offset
      const list = orders.slice(offset, offset + parseInt(pageSize)); // 定义常量 list

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
   * GET /api/orders/open
   * 获取未完成订单
   */
  router.get('/orders/open', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let orders = []; // 定义变量 orders
      if (orderStore) { // 条件判断 orderStore
        orders = await orderStore.getByStatus(['open', 'pending', 'partially_filled']); // 赋值 orders
      } // 结束代码块

      res.json({ success: true, data: orders }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createTradeRoutes; // 默认导出
