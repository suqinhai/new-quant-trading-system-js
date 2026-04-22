/**
 * RESTful API 路由 - 交易记录与订单
 * Trade Records and Orders Routes
 *
 * @module src/api/routes/trades
 */

import { Router } from 'express';

const OPEN_ORDER_STATUSES = ['open', 'pending', 'partially_filled', 'partial'];
const TRADER_ROLES = new Set(['admin', 'trader']);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrderStatus(status) {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

function getOrderIdentity(order = {}) {
  return order.orderId || order.id || order.clientOrderId || order.exchangeOrderId || null;
}

function mergeOrders(...groups) {
  const merged = new Map();

  for (const group of groups) {
    for (const order of group || []) {
      const key = getOrderIdentity(order);
      if (!key) {
        continue;
      }

      const previous = merged.get(key) || {};
      merged.set(key, { ...previous, ...order });
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const timeA = a.updatedAt || a.createdAt || a.timestamp || 0;
    const timeB = b.updatedAt || b.createdAt || b.timestamp || 0;
    return timeB - timeA;
  });
}

function getOrderExecutor(deps) {
  return deps.executor || deps.orderExecutor || deps.tradingEngine?.executor || null;
}

function ensureTraderPermission(req, res) {
  if (TRADER_ROLES.has(req.user?.role)) {
    return true;
  }

  res.status(403).json({
    success: false,
    error: 'Trader or admin permission required',
    code: 'FORBIDDEN',
  });
  return false;
}

async function getStoredOrders(orderStore, limit = 1000) {
  if (orderStore?.getRecent) {
    return await orderStore.getRecent(limit);
  }

  if (orderStore?.getAll) {
    return await orderStore.getAll();
  }

  return [];
}

async function getOpenOrders(orderStore, orderExecutor) {
  let orders = [];

  if (orderStore?.getOpenOrders) {
    orders = await orderStore.getOpenOrders();
  } else if (orderStore?.getByStatus) {
    const groups = await Promise.all(
      OPEN_ORDER_STATUSES.map(status => orderStore.getByStatus(status))
    );
    orders = mergeOrders(...groups);
  }

  if (orderExecutor?.getActiveOrders) {
    orders = mergeOrders(orders, orderExecutor.getActiveOrders());
  }

  return orders;
}

async function resolveOrderById(id, orderStore, orderExecutor) {
  if (!id) {
    return null;
  }

  if (orderStore?.getById) {
    const direct = await orderStore.getById(id);
    if (direct) {
      return direct;
    }
  }

  if (orderStore?.getByClientOrderId) {
    const clientOrder = await orderStore.getByClientOrderId(id);
    if (clientOrder) {
      return clientOrder;
    }
  }

  if (orderExecutor?.getOrderStatus) {
    const active = orderExecutor.getOrderStatus(id);
    if (active) {
      return active;
    }
  }

  if (orderExecutor?.getActiveOrders) {
    return orderExecutor.getActiveOrders().find(order =>
      order.clientOrderId === id ||
      order.exchangeOrderId === id ||
      order.orderId === id ||
      order.id === id
    ) || null;
  }

  return null;
}

function toOrderResponse(order = {}) {
  return {
    ...order,
    id: order.id || order.clientOrderId || order.orderId || order.exchangeOrderId,
    orderId: order.orderId || order.id || order.exchangeOrderId,
    clientOrderId: order.clientOrderId || null,
    exchangeOrderId: order.exchangeOrderId || null,
  };
}

/**
 * 创建交易记录路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createTradeRoutes(deps = {}) {
  const router = Router();
  const { tradeRepository, orderStore } = deps;

  /**
   * GET /api/trades
   * 获取交易列表
   */
  router.get('/', async (req, res) => {
    try {
      const {
        page = 1,
        pageSize = 20,
        symbol,
        side,
        strategy,
        startDate,
        endDate,
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = req.query;

      let trades = [];
      let total = 0;

      if (tradeRepository) {
        const result = await tradeRepository.getTradeHistory({
          symbol,
          side,
          strategy,
          startDate,
          endDate,
          limit: parsePositiveInt(pageSize, 20),
          offset: (parsePositiveInt(page, 1) - 1) * parsePositiveInt(pageSize, 20),
          sortBy,
          sortOrder,
        });
        trades = result.trades || [];
        total = result.total || trades.length;
      }

      res.json({
        success: true,
        data: trades,
        total,
        page: parsePositiveInt(page, 1),
        pageSize: parsePositiveInt(pageSize, 20),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/stats
   * 获取交易统计
   */
  router.get('/stats', async (req, res) => {
    try {
      const { startDate, endDate, symbol, strategy } = req.query;

      let stats = {
        totalTrades: 0,
        buyCount: 0,
        sellCount: 0,
        totalVolume: 0,
        totalFees: 0,
        totalPnL: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgPnL: 0,
        avgWin: 0,
        avgLoss: 0,
      };

      if (tradeRepository) {
        stats = await tradeRepository.getTradeStats({
          startDate,
          endDate,
          symbol,
          strategy,
        });
      }

      if (stats.totalTrades > 0) {
        stats.winRate = stats.winCount / stats.totalTrades;
        stats.avgPnL = stats.totalPnL / stats.totalTrades;
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/export
   * 导出交易数据
   */
  router.get('/export', async (req, res) => {
    try {
      const { format = 'csv', startDate, endDate, symbol, strategy } = req.query;

      let trades = [];
      if (tradeRepository) {
        const result = await tradeRepository.getTradeHistory({
          startDate,
          endDate,
          symbol,
          strategy,
          limit: 10000,
        });
        trades = result.trades || [];
      }

      if (format === 'csv') {
        const headers = ['时间', '交易ID', '交易对', '方向', '类型', '数量', '价格', '金额', '手续费', '盈亏', '策略', '交易所'];
        const rows = trades.map(t => [
          new Date(t.timestamp).toISOString(),
          t.tradeId,
          t.symbol,
          t.side,
          t.type,
          t.amount,
          t.price,
          t.cost,
          t.fee,
          t.realizedPnL || '',
          t.strategy || '',
          t.exchange,
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=trades_${Date.now()}.csv`);
        res.send('\uFEFF' + csv);
        return;
      }

      res.json({ success: true, data: trades });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/orders
   * 获取订单列表
   */
  router.get('/orders', async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, symbol } = req.query;
      const orderExecutor = getOrderExecutor(deps);

      let orders = await getStoredOrders(orderStore, 1000);
      if (orderExecutor?.getActiveOrders) {
        orders = mergeOrders(orders, orderExecutor.getActiveOrders());
      }

      if (status) {
        const normalizedStatus = normalizeOrderStatus(status);
        orders = orders.filter(order => normalizeOrderStatus(order.status) === normalizedStatus);
      }

      if (symbol) {
        orders = orders.filter(order => order.symbol === symbol);
      }

      const currentPage = parsePositiveInt(page, 1);
      const currentPageSize = parsePositiveInt(pageSize, 20);
      const offset = (currentPage - 1) * currentPageSize;
      const list = orders.slice(offset, offset + currentPageSize).map(toOrderResponse);

      res.json({
        success: true,
        data: list,
        total: orders.length,
        page: currentPage,
        pageSize: currentPageSize,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/orders/open
   * 获取未完成订单
   */
  router.get('/orders/open', async (req, res) => {
    try {
      const orderExecutor = getOrderExecutor(deps);
      const orders = await getOpenOrders(orderStore, orderExecutor);

      res.json({ success: true, data: orders.map(toOrderResponse) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/orders/:id
   * 获取订单详情
   */
  router.get('/orders/:id', async (req, res) => {
    try {
      const orderExecutor = getOrderExecutor(deps);
      const order = await resolveOrderById(req.params.id, orderStore, orderExecutor);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({ success: true, data: toOrderResponse(order) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/trades/orders
   * 创建订单
   */
  router.post('/orders', async (req, res) => {
    try {
      if (!ensureTraderPermission(req, res)) {
        return;
      }

      const orderExecutor = getOrderExecutor(deps);
      if (!orderExecutor?.executeOrder) {
        return res.status(503).json({
          success: false,
          error: 'Order executor unavailable',
          code: 'EXECUTOR_UNAVAILABLE',
        });
      }

      const {
        exchangeId,
        accountId,
        symbol,
        side,
        amount,
        price,
        type = 'market',
        reduceOnly = false,
        options = {},
      } = req.body || {};

      if (!exchangeId || !symbol || !side || amount == null) {
        return res.status(400).json({
          success: false,
          error: 'exchangeId, symbol, side and amount are required',
          code: 'VALIDATION_ERROR',
        });
      }

      if (type === 'limit' && price == null) {
        return res.status(400).json({
          success: false,
          error: 'price is required for limit orders',
          code: 'VALIDATION_ERROR',
        });
      }

      const result = await orderExecutor.executeOrder({
        exchangeId,
        accountId,
        symbol,
        side,
        amount: Number(amount),
        price: price == null ? undefined : Number(price),
        type,
        reduceOnly,
        options,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Order creation failed',
          code: 'ORDER_CREATE_FAILED',
        });
      }

      res.status(201).json({
        success: true,
        data: toOrderResponse({
          ...result.orderInfo,
          status: result.orderInfo?.status || result.status || 'submitted',
          orderId: result.orderId || result.orderInfo?.exchangeOrderId,
        }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/trades/orders/:id/cancel
   * 取消订单
   */
  router.post('/orders/:id/cancel', async (req, res) => {
    try {
      if (!ensureTraderPermission(req, res)) {
        return;
      }

      const orderExecutor = getOrderExecutor(deps);
      if (!orderExecutor?.cancelOrder) {
        return res.status(503).json({
          success: false,
          error: 'Order executor unavailable',
          code: 'EXECUTOR_UNAVAILABLE',
        });
      }

      const order = await resolveOrderById(req.params.id, orderStore, orderExecutor);
      const activeOrder = orderExecutor.getOrderStatus?.(req.params.id) ||
        orderExecutor.getActiveOrders?.().find(item =>
          item.clientOrderId === req.params.id || item.exchangeOrderId === req.params.id
        );

      const clientOrderId = activeOrder?.clientOrderId || order?.clientOrderId || req.params.id;
      const canceled = await orderExecutor.cancelOrder(clientOrderId);

      if (!canceled) {
        return res.status(409).json({
          success: false,
          error: 'Order is not cancellable',
          code: 'ORDER_NOT_CANCELLABLE',
        });
      }

      if (orderStore?.update) {
        const persistedOrderId = order?.orderId || order?.id;
        if (persistedOrderId) {
          await orderStore.update({
            orderId: persistedOrderId,
            status: 'canceled',
            closedAt: Date.now(),
          });
        }
      }

      res.json({
        success: true,
        message: 'Order canceled',
        data: {
          id: req.params.id,
          clientOrderId,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/trades/:id
   * 获取交易详情
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let trade = null;
      if (tradeRepository) {
        trade = await tradeRepository.getById(id);
      }

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({ success: true, data: trade });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createTradeRoutes;
