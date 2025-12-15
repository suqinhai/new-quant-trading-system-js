/**
 * 行情数据服务器
 * Market Data Server
 *
 * 独立运行的行情数据服务，提供 WebSocket 和 HTTP API
 * Standalone market data service, provides WebSocket and HTTP API
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入 HTTP 服务器 / Import HTTP server
import { createServer } from 'http';

// 导入 Express / Import Express
import express from 'express';

// 导入 Socket.IO / Import Socket.IO
import { Server as SocketIO } from 'socket.io';

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './MarketDataEngine.js';

// 导入数据聚合器 / Import data aggregator
import { DataAggregator } from './DataAggregator.js';

/**
 * 行情数据服务器类
 * Market Data Server Class
 */
class MarketDataServer {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 服务器端口 / Server port
    this.port = config.port || process.env.MARKETDATA_PORT || 3001;

    // Express 应用 / Express application
    this.app = express();

    // HTTP 服务器 / HTTP server
    this.server = createServer(this.app);

    // Socket.IO 服务器 / Socket.IO server
    this.io = new SocketIO(this.server, {
      cors: {
        origin: '*',  // 允许所有来源 (生产环境应该限制) / Allow all origins (should be restricted in production)
        methods: ['GET', 'POST'],
      },
    });

    // 数据聚合器 / Data aggregator
    this.aggregator = new DataAggregator({
      enableAggregation: true,
      enableArbitrageDetection: true,
      arbitrageThreshold: 0.1,
    });

    // 已连接的客户端 / Connected clients
    this.clients = new Map();

    // 初始化 / Initialize
    this._setupExpress();
    this._setupSocketIO();
    this._setupAggregator();
  }

  /**
   * 启动服务器
   * Start server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      // 添加交易所 / Add exchanges
      await this._setupExchanges();

      // 连接所有交易所 / Connect to all exchanges
      await this.aggregator.connectAll();

      // 启动 HTTP 服务器 / Start HTTP server
      await new Promise((resolve) => {
        this.server.listen(this.port, () => {
          console.log(`[MarketDataServer] 服务器启动在端口 ${this.port} / Server started on port ${this.port}`);
          resolve();
        });
      });

      // 发送 PM2 ready 信号 / Send PM2 ready signal
      if (process.send) {
        process.send('ready');
      }

      console.log('[MarketDataServer] 行情数据服务已启动 / Market data service started');
    } catch (error) {
      console.error('[MarketDataServer] 启动失败 / Start failed:', error);
      throw error;
    }
  }

  /**
   * 停止服务器
   * Stop server
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      // 断开所有交易所 / Disconnect from all exchanges
      await this.aggregator.disconnectAll();

      // 关闭 Socket.IO / Close Socket.IO
      this.io.close();

      // 关闭 HTTP 服务器 / Close HTTP server
      await new Promise((resolve) => {
        this.server.close(resolve);
      });

      console.log('[MarketDataServer] 服务器已停止 / Server stopped');
    } catch (error) {
      console.error('[MarketDataServer] 停止失败 / Stop failed:', error);
      throw error;
    }
  }

  /**
   * 设置 Express
   * Setup Express
   * @private
   */
  _setupExpress() {
    // 解析 JSON / Parse JSON
    this.app.use(express.json());

    // 健康检查端点 / Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',                    // 状态 / Status
        timestamp: Date.now(),           // 时间戳 / Timestamp
        uptime: process.uptime(),        // 运行时间 / Uptime
      });
    });

    // 获取所有行情 / Get all tickers
    this.app.get('/api/tickers', (req, res) => {
      const tickers = {};

      // 遍历所有交易对获取行情 / Iterate all pairs to get tickers
      for (const [key, ticker] of this.aggregator.aggregatedData.tickers) {
        tickers[key] = ticker;
      }

      res.json({
        success: true,
        data: tickers,
        timestamp: Date.now(),
      });
    });

    // 获取指定交易对行情 / Get ticker for specific pair
    this.app.get('/api/tickers/:symbol', (req, res) => {
      // 获取交易对 / Get symbol
      const symbol = req.params.symbol.replace('-', '/');

      // 获取各交易所行情 / Get tickers from each exchange
      const tickers = this.aggregator.getTickers(symbol);

      res.json({
        success: true,
        data: tickers,
        timestamp: Date.now(),
      });
    });

    // 获取最优价格 / Get best price
    this.app.get('/api/best-price/:symbol', (req, res) => {
      // 获取交易对 / Get symbol
      const symbol = req.params.symbol.replace('-', '/');

      // 获取最优价格 / Get best price
      const bestPrice = this.aggregator.getBestPrice(symbol);

      res.json({
        success: true,
        data: bestPrice,
        timestamp: Date.now(),
      });
    });

    // 获取套利机会 / Get arbitrage opportunities
    this.app.get('/api/arbitrage', (req, res) => {
      // 获取套利机会 / Get arbitrage opportunities
      const opportunities = this.aggregator.getArbitrageOpportunities();

      res.json({
        success: true,
        data: opportunities,
        timestamp: Date.now(),
      });
    });

    // 获取交易所列表 / Get exchange list
    this.app.get('/api/exchanges', (req, res) => {
      const exchanges = [];

      // 遍历所有交易所 / Iterate all exchanges
      for (const [name, engine] of this.aggregator.engines) {
        exchanges.push({
          name,
          connected: engine.connected,
          subscriptions: Array.from(engine.subscriptions),
        });
      }

      res.json({
        success: true,
        data: exchanges,
        timestamp: Date.now(),
      });
    });

    // 错误处理 / Error handling
    this.app.use((err, req, res, next) => {
      console.error('[MarketDataServer] Express 错误 / Express error:', err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    });
  }

  /**
   * 设置 Socket.IO
   * Setup Socket.IO
   * @private
   */
  _setupSocketIO() {
    // 连接事件 / Connection event
    this.io.on('connection', (socket) => {
      console.log(`[MarketDataServer] 客户端连接: ${socket.id} / Client connected: ${socket.id}`);

      // 保存客户端信息 / Save client info
      this.clients.set(socket.id, {
        socket,
        subscriptions: new Set(),
        connectedAt: Date.now(),
      });

      // 订阅请求 / Subscribe request
      socket.on('subscribe', async (data) => {
        try {
          // 获取订阅参数 / Get subscription params
          const { symbol, channels = ['ticker'] } = data;

          // 获取客户端信息 / Get client info
          const client = this.clients.get(socket.id);

          // 记录订阅 / Record subscription
          for (const channel of channels) {
            client.subscriptions.add(`${channel}:${symbol}`);
          }

          // 加入房间 / Join room
          socket.join(`ticker:${symbol}`);

          console.log(`[MarketDataServer] 客户端 ${socket.id} 订阅: ${symbol} / Client subscribed: ${symbol}`);

          // 返回确认 / Return confirmation
          socket.emit('subscribed', { symbol, channels });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // 取消订阅请求 / Unsubscribe request
      socket.on('unsubscribe', (data) => {
        try {
          const { symbol } = data;

          // 获取客户端信息 / Get client info
          const client = this.clients.get(socket.id);

          // 移除订阅 / Remove subscription
          client.subscriptions.delete(`ticker:${symbol}`);

          // 离开房间 / Leave room
          socket.leave(`ticker:${symbol}`);

          console.log(`[MarketDataServer] 客户端 ${socket.id} 取消订阅: ${symbol} / Client unsubscribed: ${symbol}`);

          // 返回确认 / Return confirmation
          socket.emit('unsubscribed', { symbol });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // 断开连接事件 / Disconnect event
      socket.on('disconnect', () => {
        console.log(`[MarketDataServer] 客户端断开: ${socket.id} / Client disconnected: ${socket.id}`);

        // 移除客户端 / Remove client
        this.clients.delete(socket.id);
      });
    });
  }

  /**
   * 设置聚合器
   * Setup aggregator
   * @private
   */
  _setupAggregator() {
    // 行情更新事件 / Ticker update event
    this.aggregator.on('ticker', (ticker) => {
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`ticker:${ticker.symbol}`).emit('ticker', ticker);
    });

    // 订单簿更新事件 / Orderbook update event
    this.aggregator.on('orderbook', (orderbook) => {
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`orderbook:${orderbook.symbol}`).emit('orderbook', orderbook);
    });

    // 成交事件 / Trade event
    this.aggregator.on('trade', (trade) => {
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`trade:${trade.symbol}`).emit('trade', trade);
    });

    // 套利机会事件 / Arbitrage opportunity event
    this.aggregator.on('arbitrageOpportunity', (opportunities) => {
      // 向所有客户端广播 / Broadcast to all clients
      this.io.emit('arbitrageOpportunity', opportunities);
    });

    // 交易所连接事件 / Exchange connected event
    this.aggregator.on('exchangeConnected', (info) => {
      this.io.emit('exchangeStatus', { ...info, status: 'connected' });
    });

    // 交易所断开事件 / Exchange disconnected event
    this.aggregator.on('exchangeDisconnected', (info) => {
      this.io.emit('exchangeStatus', { ...info, status: 'disconnected' });
    });

    // 错误事件 / Error event
    this.aggregator.on('error', (error) => {
      console.error('[MarketDataServer] 聚合器错误 / Aggregator error:', error);
    });
  }

  /**
   * 设置交易所
   * Setup exchanges
   * @private
   */
  async _setupExchanges() {
    // 从环境变量获取要连接的交易所 / Get exchanges to connect from env
    const exchangeConfig = process.env.MARKETDATA_EXCHANGES || 'binance';
    const exchanges = exchangeConfig.split(',').map(e => e.trim());

    // 添加每个交易所 / Add each exchange
    for (const exchange of exchanges) {
      this.aggregator.addExchange(exchange, { type: 'spot' });
    }

    // 获取默认订阅的交易对 / Get default symbols to subscribe
    const defaultSymbols = (process.env.DEFAULT_SYMBOLS || 'BTC/USDT,ETH/USDT').split(',').map(s => s.trim());

    // 在连接后订阅默认交易对 / Subscribe to default symbols after connection
    this.aggregator.on('exchangeConnected', async ({ exchange }) => {
      for (const symbol of defaultSymbols) {
        try {
          const engine = this.aggregator.engines.get(exchange);
          if (engine) {
            await engine.subscribe(symbol, ['ticker']);
            console.log(`[MarketDataServer] 已订阅 ${exchange}/${symbol} / Subscribed to ${exchange}/${symbol}`);
          }
        } catch (error) {
          console.error(`[MarketDataServer] 订阅失败 ${exchange}/${symbol} / Subscribe failed:`, error.message);
        }
      }
    });
  }
}

// ============================================
// 主入口 / Main Entry
// ============================================

// 创建服务器实例 / Create server instance
const server = new MarketDataServer();

// 启动服务器 / Start server
server.start().catch(error => {
  console.error('[MarketDataServer] 启动错误 / Start error:', error);
  process.exit(1);
});

// 优雅退出处理 / Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('[MarketDataServer] 收到 SIGTERM 信号，正在关闭... / Received SIGTERM, shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[MarketDataServer] 收到 SIGINT 信号，正在关闭... / Received SIGINT, shutting down...');
  await server.stop();
  process.exit(0);
});

// 导出服务器类 / Export server class
export { MarketDataServer };
export default MarketDataServer;
