/**
 * RESTful API 路由 - 交易所管理
 * Exchange Management Routes
 *
 * @module src/api/routes/exchanges
 */

import { Router } from 'express';

/**
 * 创建交易所管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createExchangeRoutes(deps = {}) {
  const router = Router();
  const { exchangeManager, configManager } = deps;

  /**
   * GET /api/exchanges
   * 获取交易所列表
   */
  router.get('/', async (req, res) => {
    try {
      let exchanges = [];

      if (exchangeManager?.getExchanges) {
        exchanges = exchangeManager.getExchanges();
      } else {
        // 默认支持的交易所 / Default supported exchanges
        exchanges = [
          { id: 'binance', name: 'Binance', status: 'disconnected' },
          { id: 'okx', name: 'OKX', status: 'disconnected' },
          { id: 'bybit', name: 'Bybit', status: 'disconnected' },
          { id: 'gate', name: 'Gate.io', status: 'disconnected' },
          { id: 'deribit', name: 'Deribit', status: 'disconnected' },
          { id: 'bitget', name: 'Bitget', status: 'disconnected' },
          { id: 'kucoin', name: 'KuCoin', status: 'disconnected' },
        ];
      }

      // 脱敏处理
      const safeExchanges = exchanges.map(ex => ({
        ...ex,
        apiKey: ex.apiKey ? ex.apiKey.slice(0, 8) + '******' : null,
        secret: ex.secret ? '******' : null,
      }));

      res.json({ success: true, data: safeExchanges });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/exchanges/:id
   * 获取交易所详情
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      let exchange = null;
      if (exchangeManager?.getExchange) {
        exchange = exchangeManager.getExchange(id);
      }

      if (!exchange) {
        return res.status(404).json({
          success: false,
          error: 'Exchange not found',
          code: 'NOT_FOUND'
        });
      }

      // 脱敏处理
      const safeExchange = {
        ...exchange,
        apiKey: exchange.apiKey ? exchange.apiKey.slice(0, 8) + '******' : null,
        secret: '******',
      };

      res.json({ success: true, data: safeExchange });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/exchanges/:id
   * 更新交易所配置
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { apiKey, secret, passphrase, testnet } = req.body;

      // 验证权限
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      if (exchangeManager?.updateExchange) {
        await exchangeManager.updateExchange(id, {
          apiKey,
          secret,
          passphrase,
          testnet,
        });
      }

      res.json({ success: true, message: 'Exchange configuration updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/exchanges/:id/test
   * 测试交易所连接
   */
  router.post('/:id/test', async (req, res) => {
    try {
      const { id } = req.params;

      let result = { success: false, message: 'Exchange manager not available' };

      if (exchangeManager?.testConnection) {
        result = await exchangeManager.testConnection(id);
      } else {
        // 模拟测试结果
        result = {
          success: true,
          latency: Math.floor(Math.random() * 200) + 50,
          serverTime: new Date().toISOString(),
        };
      }

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/exchanges/:id/balance
   * 获取交易所余额
   */
  router.get('/:id/balance', async (req, res) => {
    try {
      const { id } = req.params;

      let balance = null;

      if (exchangeManager?.getBalance) {
        balance = await exchangeManager.getBalance(id);
      } else {
        // 模拟余额
        balance = {
          total: { USDT: 10000, BTC: 0.5, ETH: 5 },
          free: { USDT: 8000, BTC: 0.3, ETH: 3 },
          used: { USDT: 2000, BTC: 0.2, ETH: 2 },
        };
      }

      res.json({ success: true, data: balance });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/exchanges/:id/markets
   * 获取交易所市场列表
   */
  router.get('/:id/markets', async (req, res) => {
    try {
      const { id } = req.params;
      const { quote, type } = req.query;

      let markets = [];

      if (exchangeManager?.getMarkets) {
        markets = await exchangeManager.getMarkets(id);
      } else {
        // 模拟市场列表
        markets = [
          { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', type: 'spot', active: true },
          { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', type: 'spot', active: true },
          { symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', type: 'swap', active: true },
        ];
      }

      // 过滤
      if (quote) {
        markets = markets.filter(m => m.quote === quote);
      }
      if (type) {
        markets = markets.filter(m => m.type === type);
      }

      res.json({ success: true, data: markets });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/exchanges/:id/ticker/:symbol
   * 获取行情数据
   */
  router.get('/:id/ticker/:symbol', async (req, res) => {
    try {
      const { id, symbol } = req.params;

      let ticker = null;

      if (exchangeManager?.getTicker) {
        ticker = await exchangeManager.getTicker(id, symbol);
      } else {
        // 模拟行情
        ticker = {
          symbol,
          last: 40000 + Math.random() * 1000,
          bid: 39990,
          ask: 40010,
          high: 41000,
          low: 39000,
          volume: 1000000,
          change: 2.5,
          timestamp: Date.now(),
        };
      }

      res.json({ success: true, data: ticker });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createExchangeRoutes;
