/**
 * RESTful API 路由 - 风控管理
 * Risk Management Routes
 *
 * @module src/api/routes/risk
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建风控管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createRiskRoutes(deps = {}) { // 导出函数 createRiskRoutes
  const router = Router(); // 定义常量 router
  const { riskManager, alertManager } = deps; // 解构赋值

  /**
   * GET /api/risk/config
   * 获取风控配置
   */
  router.get('/config', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let config = { // 定义变量 config
        maxLossPerTrade: 0.02, // 最大亏损每笔交易
        maxDailyLoss: 0.05, // 最大每日亏损
        maxPositions: 10, // 最大持仓
        maxPositionSize: 0.2, // 最大持仓大小
        maxLeverage: 3, // 最大杠杆
        defaultStopLoss: 0.05, // 默认止损
        defaultTakeProfit: 0.1, // 默认止盈
        enableTrailingStop: false, // 启用跟踪止损
        trailingStopDistance: 0.03, // 跟踪止损距离
        cooldownPeriod: 60000, // 冷却周期
      }; // 结束代码块

      let state = { // 定义变量 state
        tradingAllowed: true, // 交易Allowed
        dailyPnL: 0, // 每日PnL
        dailyTradeCount: 0, // 每日交易数量
        currentPositions: 0, // current持仓
        consecutiveLosses: 0, // consecutiveLosses
        lastTradeTime: null, // last交易时间
        triggerCount: 0, // trigger数量
      }; // 结束代码块

      if (riskManager) { // 条件判断 riskManager
        config = riskManager.config || config; // 赋值 config
        state = riskManager.state || state; // 赋值 state
      } // 结束代码块

      res.json({ success: true, data: { ...config, state } }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * PUT /api/risk/config
   * 更新风控配置
   */
  router.put('/config', async (req, res) => { // 调用 router.put
    try { // 尝试执行
      const updates = req.body; // 定义常量 updates

      // 验证权限
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      // 验证参数范围
      const validations = { // 定义常量 validations
        maxLossPerTrade: { min: 0.001, max: 0.5 }, // 最大亏损每笔交易
        maxDailyLoss: { min: 0.01, max: 1 }, // 最大每日亏损
        maxPositions: { min: 1, max: 100 }, // 最大持仓
        maxPositionSize: { min: 0.01, max: 1 }, // 最大持仓大小
        maxLeverage: { min: 1, max: 125 }, // 最大杠杆
        defaultStopLoss: { min: 0.001, max: 0.5 }, // 默认止损
        defaultTakeProfit: { min: 0.001, max: 1 }, // 默认止盈
        trailingStopDistance: { min: 0.001, max: 0.5 }, // 跟踪止损距离
        cooldownPeriod: { min: 0, max: 3600000 }, // 冷却周期
      }; // 结束代码块

      for (const [key, value] of Object.entries(updates)) { // 循环 const [key, value] of Object.entries(updates)
        if (validations[key]) { // 条件判断 validations[key]
          const { min, max } = validations[key]; // 解构赋值
          if (typeof value === 'number' && (value < min || value > max)) { // 条件判断 typeof value === 'number' && (value < min || ...
            return res.status(400).json({ // 返回结果
              success: false, // 成功标记
              error: `${key} must be between ${min} and ${max}`, // 错误
              code: 'VALIDATION_ERROR' // 代码
            }); // 结束代码块
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      if (riskManager?.updateConfig) { // 条件判断 riskManager?.updateConfig
        riskManager.updateConfig(updates); // 调用 riskManager.updateConfig
      } // 结束代码块

      res.json({ success: true, message: 'Risk configuration updated' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/risk/limits
   * 获取风控限制
   */
  router.get('/limits', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let limits = { // 定义变量 limits
        maxDailyTrades: 100, // 最大每日成交
        maxConsecutiveLosses: 5, // 最大ConsecutiveLosses
        maxOrderAmount: 10000, // 最大订单数量
        blacklistedSymbols: [], // blacklisted交易对列表
      }; // 结束代码块

      if (riskManager?.getLimits) { // 条件判断 riskManager?.getLimits
        limits = riskManager.getLimits(); // 赋值 limits
      } // 结束代码块

      res.json({ success: true, data: limits }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * PUT /api/risk/limits
   * 更新风控限制
   */
  router.put('/limits', async (req, res) => { // 调用 router.put
    try { // 尝试执行
      const updates = req.body; // 定义常量 updates

      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (riskManager?.updateLimits) { // 条件判断 riskManager?.updateLimits
        riskManager.updateLimits(updates); // 调用 riskManager.updateLimits
      } // 结束代码块

      res.json({ success: true, message: 'Risk limits updated' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/risk/alerts
   * 获取风控告警
   */
  router.get('/alerts', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const { page = 1, pageSize = 50, level, dismissed } = req.query; // 解构赋值

      let alerts = []; // 定义变量 alerts

      if (alertManager) { // 条件判断 alertManager
        alerts = await alertManager.getAlerts(); // 赋值 alerts
      } // 结束代码块

      // 过滤
      if (level) { // 条件判断 level
        alerts = alerts.filter(a => a.level === level); // 赋值 alerts
      } // 结束代码块
      if (dismissed !== undefined) { // 条件判断 dismissed !== undefined
        const isDismissed = dismissed === 'true'; // 定义常量 isDismissed
        alerts = alerts.filter(a => a.dismissed === isDismissed); // 赋值 alerts
      } // 结束代码块

      // 分页
      const total = alerts.length; // 定义常量 total
      const offset = (page - 1) * pageSize; // 定义常量 offset
      const list = alerts.slice(offset, offset + parseInt(pageSize)); // 定义常量 list

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
   * POST /api/risk/alerts/:id/dismiss
   * 消除告警
   */
  router.post('/alerts/:id/dismiss', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { id } = req.params; // 解构赋值

      if (alertManager?.dismissAlert) { // 条件判断 alertManager?.dismissAlert
        await alertManager.dismissAlert(id); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: 'Alert dismissed' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/risk/trading/enable
   * 启用交易
   */
  router.post('/trading/enable', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (riskManager?.enableTrading) { // 条件判断 riskManager?.enableTrading
        riskManager.enableTrading(); // 调用 riskManager.enableTrading
      } // 结束代码块

      res.json({ success: true, message: 'Trading enabled' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/risk/trading/disable
   * 禁用交易
   */
  router.post('/trading/disable', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { reason } = req.body; // 解构赋值

      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (riskManager?.disableTrading) { // 条件判断 riskManager?.disableTrading
        riskManager.disableTrading(reason || 'Manual disable'); // 调用 riskManager.disableTrading
      } // 结束代码块

      res.json({ success: true, message: 'Trading disabled' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createRiskRoutes; // 默认导出
