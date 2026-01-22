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

  /**
   * GET /api/dashboard/summary
   * 获取仪表板摘要
   */
  router.get('/summary', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let summary = { // 定义变量 summary
        totalAssets: 0, // 设置 totalAssets 字段
        availableBalance: 0, // 设置 availableBalance 字段
        positionValue: 0, // 设置 positionValue 字段
        todayPnL: 0, // 设置 todayPnL 字段
        todayPnLPercent: 0, // 设置 todayPnLPercent 字段
        totalPnL: 0, // 设置 totalPnL 字段
        totalPnLPercent: 0, // 设置 totalPnLPercent 字段
        runningStrategies: 0, // 设置 runningStrategies 字段
        totalStrategies: 0, // 设置 totalStrategies 字段
        openPositions: 0, // 设置 openPositions 字段
        todayTrades: 0, // 设置 todayTrades 字段
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
      const { period = '7d' } = req.query; // 解构赋值

      let pnlData = { // 定义变量 pnlData
        dates: [], // 设置 dates 字段
        values: [], // 设置 values 字段
        cumulative: [], // 设置 cumulative 字段
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

      res.json({ success: true, data: pnlData }); // 调用 res.json
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
          limit: parseInt(limit), // 设置 limit 字段
          sortBy: 'timestamp', // 设置 sortBy 字段
          sortOrder: 'desc', // 设置 sortOrder 字段
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
        total: positions.length, // 设置 total 字段
        totalValue: positions.reduce((sum, p) => sum + (p.currentValue || 0), 0), // 设置 totalValue 字段
        totalPnL: positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0), // 设置 totalPnL 字段
        positions: positions.slice(0, 10), // 只返回前10个
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
        cpu: { // 设置 cpu 字段
          usage: Math.random() * 30 + 10, // 模拟 CPU 使用率
        }, // 结束代码块
        memory: { // 设置 memory 字段
          used: memory.heapUsed, // 设置 used 字段
          total: memory.heapTotal, // 设置 total 字段
          percent: (memory.heapUsed / memory.heapTotal) * 100, // 设置 percent 字段
        }, // 结束代码块
        uptime: process.uptime(), // 设置 uptime 字段
        latency: Math.random() * 50 + 10, // 模拟延迟
        timestamp: Date.now(), // 设置 timestamp 字段
      }; // 结束代码块

      res.json({ success: true, data: metrics }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createDashboardRoutes; // 默认导出
