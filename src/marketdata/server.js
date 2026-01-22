/**
 * 行情数据服务器
 * Market Data Server
 *
 * 独立运行的行情数据服务，提供 WebSocket 和 HTTP API
 * Standalone market data service, provides WebSocket and HTTP API
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config'; // 加载模块 dotenv/config

// 导入路径模块 / Import path module
import { fileURLToPath } from 'url'; // 导入模块 url
import { resolve } from 'path'; // 导入模块 path

// 导入 HTTP 服务器 / Import HTTP server
import { createServer } from 'http'; // 导入模块 http

// 导入 Express / Import Express
import express from 'express'; // 导入模块 express

// 导入 Socket.IO / Import Socket.IO
import { Server as SocketIO } from 'socket.io'; // 导入模块 socket.io

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './MarketDataEngine.js'; // 导入模块 ./MarketDataEngine.js

// 导入数据聚合器 / Import data aggregator
import { DataAggregator } from './DataAggregator.js'; // 导入模块 ./DataAggregator.js

/**
 * 行情数据服务器类
 * Market Data Server Class
 */
class MarketDataServer { // 定义类 MarketDataServer
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 服务器端口 / Server port
    this.port = config.port || process.env.MARKETDATA_PORT || 3001; // 设置 port

    // Express 应用 / Express application
    this.app = express(); // 设置 app

    // HTTP 服务器 / HTTP server
    this.server = createServer(this.app); // 设置 server

    // Socket.IO 服务器 / Socket.IO server
    this.io = new SocketIO(this.server, { // 设置 io
      cors: { // 设置 cors 字段
        origin: '*',  // 允许所有来源 (生产环境应该限制) / Allow all origins (should be restricted in production)
        methods: ['GET', 'POST'], // 设置 methods 字段
      }, // 结束代码块
    }); // 结束代码块

    // 数据聚合器 / Data aggregator
    this.aggregator = new DataAggregator({ // 设置 aggregator
      enableAggregation: true, // 设置 enableAggregation 字段
      enableArbitrageDetection: true, // 设置 enableArbitrageDetection 字段
      arbitrageThreshold: 0.1, // 设置 arbitrageThreshold 字段
    }); // 结束代码块

    // 已连接的客户端 / Connected clients
    this.clients = new Map(); // 设置 clients

    // 初始化 / Initialize
    this._setupExpress(); // 调用 _setupExpress
    this._setupSocketIO(); // 调用 _setupSocketIO
    this._setupAggregator(); // 调用 _setupAggregator
  } // 结束代码块

  /**
   * 启动服务器
   * Start server
   * @returns {Promise<void>}
   */
  async start() { // 执行语句
    try { // 尝试执行
      // 添加交易所 / Add exchanges
      await this._setupExchanges(); // 等待异步结果

      // 连接所有交易所 / Connect to all exchanges
      await this.aggregator.connectAll(); // 等待异步结果

      // 启动 HTTP 服务器 / Start HTTP server
      await new Promise((resolve) => { // 等待异步结果
        this.server.listen(this.port, () => { // 访问 server
          console.log(`[MarketDataServer] 服务器启动在端口 ${this.port} / Server started on port ${this.port}`); // 控制台输出
          resolve(); // 调用 resolve
        }); // 结束代码块
      }); // 结束代码块

      // 发送 PM2 ready 信号 / Send PM2 ready signal
      if (process.send) { // 条件判断 process.send
        process.send('ready'); // 调用 process.send
      } // 结束代码块

      console.log('[MarketDataServer] 行情数据服务已启动 / Market data service started'); // 控制台输出
    } catch (error) { // 执行语句
      console.error('[MarketDataServer] 启动失败 / Start failed:', error); // 控制台输出
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止服务器
   * Stop server
   * @returns {Promise<void>}
   */
  async stop() { // 执行语句
    try { // 尝试执行
      // 断开所有交易所 / Disconnect from all exchanges
      await this.aggregator.disconnectAll(); // 等待异步结果

      // 关闭 Socket.IO / Close Socket.IO
      this.io.close(); // 访问 io

      // 关闭 HTTP 服务器 / Close HTTP server
      await new Promise((resolve) => { // 等待异步结果
        this.server.close(resolve); // 访问 server
      }); // 结束代码块

      console.log('[MarketDataServer] 服务器已停止 / Server stopped'); // 控制台输出
    } catch (error) { // 执行语句
      console.error('[MarketDataServer] 停止失败 / Stop failed:', error); // 控制台输出
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置 Express
   * Setup Express
   * @private
   */
  _setupExpress() { // 调用 _setupExpress
    // 解析 JSON / Parse JSON
    this.app.use(express.json()); // 访问 app

    // 健康检查端点 / Health check endpoint
    this.app.get('/health', (req, res) => { // 访问 app
      res.json({ // 调用 res.json
        status: 'ok',                    // 状态 / Status
        timestamp: Date.now(),           // 时间戳 / Timestamp
        uptime: process.uptime(),        // 运行时间 / Uptime
      }); // 结束代码块
    }); // 结束代码块

    // 获取所有行情 / Get all tickers
    this.app.get('/api/tickers', (req, res) => { // 访问 app
      const tickers = {}; // 定义常量 tickers

      // 遍历所有交易对获取行情 / Iterate all pairs to get tickers
      for (const [key, ticker] of this.aggregator.aggregatedData.tickers) { // 循环 const [key, ticker] of this.aggregator.aggreg...
        tickers[key] = ticker; // 执行语句
      } // 结束代码块

      res.json({ // 调用 res.json
        success: true, // 设置 success 字段
        data: tickers, // 设置 data 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    }); // 结束代码块

    // 获取指定交易对行情 / Get ticker for specific pair
    this.app.get('/api/tickers/:symbol', (req, res) => { // 访问 app
      // 获取交易对 / Get symbol
      const symbol = req.params.symbol.replace('-', '/'); // 定义常量 symbol

      // 获取各交易所行情 / Get tickers from each exchange
      const tickers = this.aggregator.getTickers(symbol); // 定义常量 tickers

      res.json({ // 调用 res.json
        success: true, // 设置 success 字段
        data: tickers, // 设置 data 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    }); // 结束代码块

    // 获取最优价格 / Get best price
    this.app.get('/api/best-price/:symbol', (req, res) => { // 访问 app
      // 获取交易对 / Get symbol
      const symbol = req.params.symbol.replace('-', '/'); // 定义常量 symbol

      // 获取最优价格 / Get best price
      const bestPrice = this.aggregator.getBestPrice(symbol); // 定义常量 bestPrice

      res.json({ // 调用 res.json
        success: true, // 设置 success 字段
        data: bestPrice, // 设置 data 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    }); // 结束代码块

    // 获取套利机会 / Get arbitrage opportunities
    this.app.get('/api/arbitrage', (req, res) => { // 访问 app
      // 获取套利机会 / Get arbitrage opportunities
      const opportunities = this.aggregator.getArbitrageOpportunities(); // 定义常量 opportunities

      res.json({ // 调用 res.json
        success: true, // 设置 success 字段
        data: opportunities, // 设置 data 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    }); // 结束代码块

    // 获取交易所列表 / Get exchange list
    this.app.get('/api/exchanges', (req, res) => { // 访问 app
      const exchanges = []; // 定义常量 exchanges

      // 遍历所有交易所 / Iterate all exchanges
      for (const [name, engine] of this.aggregator.engines) { // 循环 const [name, engine] of this.aggregator.engines
        exchanges.push({ // 调用 exchanges.push
          name, // 执行语句
          connected: engine.connected, // 设置 connected 字段
          subscriptions: Array.from(engine.subscriptions), // 设置 subscriptions 字段
        }); // 结束代码块
      } // 结束代码块

      res.json({ // 调用 res.json
        success: true, // 设置 success 字段
        data: exchanges, // 设置 data 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    }); // 结束代码块

    // 错误处理 / Error handling
    this.app.use((err, req, res, next) => { // 访问 app
      console.error('[MarketDataServer] Express 错误 / Express error:', err); // 控制台输出
      res.status(500).json({ // 调用 res.status
        success: false, // 设置 success 字段
        error: err.message, // 设置 error 字段
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置 Socket.IO
   * Setup Socket.IO
   * @private
   */
  _setupSocketIO() { // 调用 _setupSocketIO
    // 连接事件 / Connection event
    this.io.on('connection', (socket) => { // 访问 io
      console.log(`[MarketDataServer] 客户端连接: ${socket.id} / Client connected: ${socket.id}`); // 控制台输出

      // 保存客户端信息 / Save client info
      this.clients.set(socket.id, { // 访问 clients
        socket, // 执行语句
        subscriptions: new Set(), // 设置 subscriptions 字段
        connectedAt: Date.now(), // 设置 connectedAt 字段
      }); // 结束代码块

      // 订阅请求 / Subscribe request
      socket.on('subscribe', async (data) => { // 注册事件监听
        try { // 尝试执行
          // 获取订阅参数 / Get subscription params
          const { symbol, channels = ['ticker'] } = data; // 解构赋值

          // 获取客户端信息 / Get client info
          const client = this.clients.get(socket.id); // 定义常量 client

          // 记录订阅 / Record subscription
          for (const channel of channels) { // 循环 const channel of channels
            client.subscriptions.add(`${channel}:${symbol}`); // 调用 client.subscriptions.add
          } // 结束代码块

          // 加入房间 / Join room
          socket.join(`ticker:${symbol}`); // 调用 socket.join

          console.log(`[MarketDataServer] 客户端 ${socket.id} 订阅: ${symbol} / Client subscribed: ${symbol}`); // 控制台输出

          // 返回确认 / Return confirmation
          socket.emit('subscribed', { symbol, channels }); // 触发事件
        } catch (error) { // 执行语句
          socket.emit('error', { message: error.message }); // 触发事件
        } // 结束代码块
      }); // 结束代码块

      // 取消订阅请求 / Unsubscribe request
      socket.on('unsubscribe', (data) => { // 注册事件监听
        try { // 尝试执行
          const { symbol } = data; // 解构赋值

          // 获取客户端信息 / Get client info
          const client = this.clients.get(socket.id); // 定义常量 client

          // 移除订阅 / Remove subscription
          client.subscriptions.delete(`ticker:${symbol}`); // 调用 client.subscriptions.delete

          // 离开房间 / Leave room
          socket.leave(`ticker:${symbol}`); // 调用 socket.leave

          console.log(`[MarketDataServer] 客户端 ${socket.id} 取消订阅: ${symbol} / Client unsubscribed: ${symbol}`); // 控制台输出

          // 返回确认 / Return confirmation
          socket.emit('unsubscribed', { symbol }); // 触发事件
        } catch (error) { // 执行语句
          socket.emit('error', { message: error.message }); // 触发事件
        } // 结束代码块
      }); // 结束代码块

      // 断开连接事件 / Disconnect event
      socket.on('disconnect', () => { // 注册事件监听
        console.log(`[MarketDataServer] 客户端断开: ${socket.id} / Client disconnected: ${socket.id}`); // 控制台输出

        // 移除客户端 / Remove client
        this.clients.delete(socket.id); // 访问 clients
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置聚合器
   * Setup aggregator
   * @private
   */
  _setupAggregator() { // 调用 _setupAggregator
    // 行情更新事件 / Ticker update event
    this.aggregator.on('ticker', (ticker) => { // 访问 aggregator
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`ticker:${ticker.symbol}`).emit('ticker', ticker); // 访问 io
    }); // 结束代码块

    // 订单簿更新事件 / Orderbook update event
    this.aggregator.on('orderbook', (orderbook) => { // 访问 aggregator
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`orderbook:${orderbook.symbol}`).emit('orderbook', orderbook); // 访问 io
    }); // 结束代码块

    // 成交事件 / Trade event
    this.aggregator.on('trade', (trade) => { // 访问 aggregator
      // 向订阅该交易对的客户端广播 / Broadcast to clients subscribed to this pair
      this.io.to(`trade:${trade.symbol}`).emit('trade', trade); // 访问 io
    }); // 结束代码块

    // 套利机会事件 / Arbitrage opportunity event
    this.aggregator.on('arbitrageOpportunity', (opportunities) => { // 访问 aggregator
      // 向所有客户端广播 / Broadcast to all clients
      this.io.emit('arbitrageOpportunity', opportunities); // 访问 io
    }); // 结束代码块

    // 交易所连接事件 / Exchange connected event
    this.aggregator.on('exchangeConnected', (info) => { // 访问 aggregator
      this.io.emit('exchangeStatus', { ...info, status: 'connected' }); // 访问 io
    }); // 结束代码块

    // 交易所断开事件 / Exchange disconnected event
    this.aggregator.on('exchangeDisconnected', (info) => { // 访问 aggregator
      this.io.emit('exchangeStatus', { ...info, status: 'disconnected' }); // 访问 io
    }); // 结束代码块

    // 错误事件 / Error event
    this.aggregator.on('error', (error) => { // 访问 aggregator
      console.error('[MarketDataServer] 聚合器错误 / Aggregator error:', error); // 控制台输出
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置交易所
   * Setup exchanges
   * @private
   */
  async _setupExchanges() { // 执行语句
    // 从环境变量获取要连接的交易所 / Get exchanges to connect from env
    const exchangeConfig = process.env.MARKETDATA_EXCHANGES || 'binance'; // 定义常量 exchangeConfig
    const exchanges = exchangeConfig.split(',').map(e => e.trim()); // 定义函数 exchanges

    // 添加每个交易所 / Add each exchange
    for (const exchange of exchanges) { // 循环 const exchange of exchanges
      this.aggregator.addExchange(exchange, { type: 'spot' }); // 访问 aggregator
    } // 结束代码块

    // 获取默认订阅的交易对 / Get default symbols to subscribe
    const defaultSymbols = (process.env.DEFAULT_SYMBOLS || 'BTC/USDT,ETH/USDT').split(',').map(s => s.trim()); // 定义函数 defaultSymbols

    // 在连接后订阅默认交易对 / Subscribe to default symbols after connection
    this.aggregator.on('exchangeConnected', async ({ exchange }) => { // 访问 aggregator
      for (const symbol of defaultSymbols) { // 循环 const symbol of defaultSymbols
        try { // 尝试执行
          const engine = this.aggregator.engines.get(exchange); // 定义常量 engine
          if (engine) { // 条件判断 engine
            await engine.subscribe(symbol, ['ticker']); // 等待异步结果
            console.log(`[MarketDataServer] 已订阅 ${exchange}/${symbol} / Subscribed to ${exchange}/${symbol}`); // 控制台输出
          } // 结束代码块
        } catch (error) { // 执行语句
          console.error(`[MarketDataServer] 订阅失败 ${exchange}/${symbol} / Subscribe failed:`, error.message); // 控制台输出
        } // 结束代码块
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主入口 / Main Entry
// ============================================

// 判断是否直接运行此文件 / Check if this file is run directly
// 只有直接运行时才启动服务器，被导入时不启动
// Only start server when run directly, not when imported
const __filename = fileURLToPath(import.meta.url); // 定义常量 __filename
const isMainModule = resolve(process.argv[1]) === __filename; // 定义常量 isMainModule

if (isMainModule) { // 条件判断 isMainModule
  // 创建服务器实例 / Create server instance
  const server = new MarketDataServer(); // 定义常量 server

  // 启动服务器 / Start server
  server.start().catch(error => { // 调用 server.start
    console.error('[MarketDataServer] 启动错误 / Start error:', error); // 控制台输出
    process.exit(1); // 退出进程
  }); // 结束代码块

  // 优雅退出处理 / Graceful shutdown handling
  process.on('SIGTERM', async () => { // 注册事件监听
    console.log('[MarketDataServer] 收到 SIGTERM 信号，正在关闭... / Received SIGTERM, shutting down...'); // 控制台输出
    await server.stop(); // 等待异步结果
    process.exit(0); // 退出进程
  }); // 结束代码块

  process.on('SIGINT', async () => { // 注册事件监听
    console.log('[MarketDataServer] 收到 SIGINT 信号，正在关闭... / Received SIGINT, shutting down...'); // 控制台输出
    await server.stop(); // 等待异步结果
    process.exit(0); // 退出进程
  }); // 结束代码块
} // 结束代码块

// 导出服务器类 / Export server class
export { MarketDataServer }; // 导出命名成员
export default MarketDataServer; // 默认导出
