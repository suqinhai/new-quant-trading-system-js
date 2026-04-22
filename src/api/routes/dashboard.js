/**
 * RESTful API 路由 - 仪表板
 * Dashboard Routes
 *
 * @module src/api/routes/dashboard
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建仪表板路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createDashboardRoutes(deps = {}) { // 导出函数 createDashboardRoutes
  const router = Router(); // 定义常量 router
  const { dashboardService, tradeRepository, positionStore, alertManager } = deps; // 解构赋值

  const normalizePnLPoints = (payload) => { // 定义函数 normalizePnLPoints
    if (Array.isArray(payload)) { // 条件判断 Array.isArray(payload)
      return payload; // 返回结果
    } // 结束代码块

    const dates = payload?.dates || []; // 定义常量 dates
    const values = payload?.values || []; // 定义常量 values
    const cumulative = payload?.cumulative || []; // 定义常量 cumulative

    return dates.map((date, index) => ({ // 返回结果
      timestamp: date, // timestamp
      value: values[index] ?? 0, // value
      cumulativePnL: cumulative[index] ?? values[index] ?? 0, // cumulativePnL
    })); // 结束代码块
  }; // 结束代码块

  const summarizePerformance = (trades = [], period = '7d') => { // 定义函数 summarizePerformance
    const pnlSeries = trades.map(trade => Number(
      trade.realizedPnL
      ?? trade.pnl
      ?? trade.profit
      ?? trade.netPnl
      ?? 0
    ));
    const totalPnL = pnlSeries.reduce((sum, value) => sum + value, 0);
    const winningTrades = pnlSeries.filter(value => value > 0).length;
    const totalTrades = pnlSeries.length;
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const value of pnlSeries) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, equity - peak);
    }

    return {
      period,
      totalTrades,
      winningTrades,
      losingTrades: pnlSeries.filter(value => value < 0).length,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
      totalPnL,
      averagePnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
      maxDrawdown: Math.abs(maxDrawdown),
      sharpeRatio: 0,
      totalReturn: totalPnL,
    };
  }; // 结束代码块

  /**
   * GET /api/dashboard/summary
   * 获取仪表板摘要
   */
  router.get('/summary', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let summary = { // 定义变量 summary
        totalAssets: 0, // 总Assets
        availableBalance: 0, // available余额
        positionValue: 0, // 持仓Value
        todayPnL: 0, // todayPnL
        todayPnLPercent: 0, // todayPnL百分比
        totalPnL: 0, // 总PnL
        totalPnLPercent: 0, // 总PnL百分比
        runningStrategies: 0, // running策略
        totalStrategies: 0, // 总策略
        openPositions: 0, // 开盘持仓
        todayTrades: 0, // today成交
      }; // 结束代码块

      if (dashboardService?.getSummary) { // 条件判断 dashboardService?.getSummary
        summary = await dashboardService.getSummary(); // 赋值 summary
      } // 结束代码块

      res.json({ success: true, data: summary }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/pnl
   * 获取盈亏数据
   */
  router.get('/pnl', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const period = req.query.period || req.query.range || '7d'; // 定义常量 period

      let pnlData = { // 定义变量 pnlData
        dates: [], // dates
        values: [], // values
        cumulative: [], // cumulative
      }; // 结束代码块

      if (dashboardService?.getPnLHistory) { // 条件判断 dashboardService?.getPnLHistory
        pnlData = await dashboardService.getPnLHistory(period); // 赋值 pnlData
      } else { // 执行语句
        // 模拟数据
        const days = period === '1d' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90; // 定义常量 days
        const now = Date.now(); // 定义常量 now
        for (let i = days - 1; i >= 0; i--) { // 循环 let i = days - 1; i >= 0; i--
          const date = new Date(now - i * 24 * 60 * 60 * 1000); // 定义常量 date
          pnlData.dates.push(date.toISOString().split('T')[0]); // 调用 pnlData.dates.push
          pnlData.values.push(Math.random() * 1000 - 200); // 调用 pnlData.values.push
        } // 结束代码块
        let cum = 0; // 定义变量 cum
        pnlData.cumulative = pnlData.values.map(v => (cum += v)); // 赋值 pnlData.cumulative
      } // 结束代码块

      const points = normalizePnLPoints(pnlData); // 定义常量 points

      res.json({ success: true, data: { ...pnlData, points } }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/performance
   * 获取绩效概览
   */
  router.get('/performance', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const period = req.query.period || req.query.range || '7d'; // 定义常量 period

      if (dashboardService?.getPerformance) { // 条件判断 dashboardService?.getPerformance
        const performance = await dashboardService.getPerformance(period); // 定义常量 performance
        return res.json({ success: true, data: { period, ...performance } }); // 返回结果
      } // 结束代码块

      let trades = []; // 定义变量 trades
      if (tradeRepository?.getTradeHistory) { // 条件判断 tradeRepository?.getTradeHistory
        const result = await tradeRepository.getTradeHistory({ // 定义常量 result
          limit: 200, // 限制
          sortBy: 'timestamp', // sortBy
          sortOrder: 'desc', // sortOrder
        }); // 结束代码块
        trades = result?.trades || []; // 赋值 trades
      } // 结束代码块

      res.json({ success: true, data: summarizePerformance(trades, period) }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/recent-trades
   * 获取最近交易
   */
  router.get('/recent-trades', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { limit = 10 } = req.query; // 解构赋值

      let trades = []; // 定义变量 trades

      if (tradeRepository) { // 条件判断 tradeRepository
        const result = await tradeRepository.getTradeHistory({ // 定义常量 result
          limit: parseInt(limit), // 限制
          sortBy: 'timestamp', // sortBy
          sortOrder: 'desc', // sort订单
        }); // 结束代码块
        trades = result.trades || []; // 赋值 trades
      } // 结束代码块

      res.json({ success: true, data: trades }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/alerts
   * 获取告警
   */
  router.get('/alerts', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { limit = 5 } = req.query; // 解构赋值

      let alerts = []; // 定义变量 alerts

      if (alertManager) { // 条件判断 alertManager
        alerts = await alertManager.getAlerts(); // 赋值 alerts
        alerts = alerts.filter(a => !a.dismissed).slice(0, parseInt(limit)); // 赋值 alerts
      } // 结束代码块

      res.json({ success: true, data: alerts }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/positions
   * 获取持仓摘要
   */
  router.get('/positions', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let positions = []; // 定义变量 positions

      if (positionStore) { // 条件判断 positionStore
        positions = await positionStore.getAll(); // 赋值 positions
      } // 结束代码块

      // 计算持仓摘要
      const summary = { // 定义常量 summary
        total: positions.length, // 总
        totalValue: positions.reduce((sum, p) => sum + (p.currentValue || 0), 0), // 总Value
        totalPnL: positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0), // 总PnL
        positions: positions.slice(0, 10), // 持仓
      }; // 结束代码块

      res.json({ success: true, data: summary }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/dashboard/system-metrics
   * 获取系统指标
   */
  router.get('/system-metrics', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const memory = process.memoryUsage(); // 定义常量 memory
      const metrics = { // 定义常量 metrics
        cpu: { // CPU
          usage: Math.random() * 30 + 10, // 使用
        }, // 结束代码块
        memory: { // 内存
          used: memory.heapUsed, // used
          total: memory.heapTotal, // 总
          percent: (memory.heapUsed / memory.heapTotal) * 100, // 百分比
        }, // 结束代码块
        uptime: process.uptime(), // uptime
        latency: Math.random() * 50 + 10, // latency
        timestamp: Date.now(), // 时间戳
      }; // 结束代码块

      res.json({ success: true, data: metrics }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createDashboardRoutes; // 默认导出
