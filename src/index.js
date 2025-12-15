/**
 * 量化交易系统主入口
 * Quant Trading System Main Entry
 *
 * 整合所有模块，提供统一的系统入口
 * Integrates all modules and provides unified system entry point
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入交易所模块 / Import exchange module
import { ExchangeFactory } from './exchange/index.js';

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './marketdata/index.js';

// 导入策略模块 / Import strategy module
import { StrategyRegistry } from './strategies/index.js';

// 导入风控模块 / Import risk module
import { RiskManager, PositionCalculator } from './risk/index.js';

// 导入订单执行器 / Import order executor
import { OrderExecutor } from './executor/index.js';

// 导入监控模块 / Import monitor module
import { SystemMonitor, AlertManager } from './monitor/index.js';

// 导入配置 / Import configuration
import { loadConfig } from '../config/index.js';

// 导入工具函数 / Import utilities
import { logger, formatDate, sleep } from './utils/index.js';

/**
 * 量化交易引擎
 * Quant Trading Engine
 */
export class TradingEngine extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并配置 / Merge configuration
    this.config = loadConfig(config);

    // 引擎状态 / Engine state
    this.state = {
      status: 'stopped',    // stopped | starting | running | stopping
      startTime: null,      // 启动时间 / Start time
      error: null,          // 最后错误 / Last error
    };

    // 组件实例 / Component instances
    this.exchange = null;           // 交易所 / Exchange
    this.marketData = null;         // 行情引擎 / Market data engine
    this.strategy = null;           // 当前策略 / Current strategy
    this.riskManager = null;        // 风控管理器 / Risk manager
    this.positionCalculator = null; // 仓位计算器 / Position calculator
    this.executor = null;           // 订单执行器 / Order executor
    this.monitor = null;            // 系统监控 / System monitor
    this.alertManager = null;       // 告警管理器 / Alert manager

    // 运行中的策略 / Running strategies
    this.runningStrategies = new Map();

    // 日志记录器 / Logger
    this.logger = logger;
  }

  /**
   * 初始化引擎
   * Initialize engine
   */
  async initialize() {
    this.logger.info('[TradingEngine] 初始化交易引擎 / Initializing trading engine');

    try {
      // 1. 创建交易所实例 / Create exchange instance
      this.logger.info('[TradingEngine] 创建交易所连接 / Creating exchange connection');
      this.exchange = ExchangeFactory.create(
        this.config.exchange.default,
        this.config.exchange[this.config.exchange.default]
      );

      // 加载市场信息 / Load market info
      await this.exchange.loadMarkets();
      this.logger.info('[TradingEngine] 交易所连接成功 / Exchange connected');

      // 2. 创建行情引擎 / Create market data engine
      this.logger.info('[TradingEngine] 初始化行情引擎 / Initializing market data engine');
      this.marketData = new MarketDataEngine(this.exchange, this.config.marketData);

      // 3. 创建风控管理器 / Create risk manager
      this.logger.info('[TradingEngine] 初始化风控模块 / Initializing risk module');
      this.riskManager = new RiskManager(this.config.risk);
      this.positionCalculator = new PositionCalculator(this.config.risk);

      // 4. 创建订单执行器 / Create order executor
      this.logger.info('[TradingEngine] 初始化订单执行器 / Initializing order executor');
      this.executor = new OrderExecutor(this.exchange, this.config.executor);

      // 5. 创建监控模块 / Create monitor module
      this.logger.info('[TradingEngine] 初始化监控模块 / Initializing monitor module');
      this.monitor = new SystemMonitor(this.config.monitor);
      this.alertManager = new AlertManager(this.config.alert);

      // 6. 绑定事件 / Bind events
      this._bindEvents();

      this.logger.info('[TradingEngine] 初始化完成 / Initialization complete');

      // 发出初始化完成事件 / Emit initialized event
      this.emit('initialized');

    } catch (error) {
      this.logger.error('[TradingEngine] 初始化失败 / Initialization failed:', error);
      this.state.error = error;
      throw error;
    }
  }

  /**
   * 启动引擎
   * Start engine
   */
  async start() {
    // 检查状态 / Check state
    if (this.state.status !== 'stopped') {
      throw new Error('引擎已在运行 / Engine is already running');
    }

    this.logger.info('[TradingEngine] 启动交易引擎 / Starting trading engine');
    this.state.status = 'starting';

    try {
      // 初始化 (如果尚未初始化) / Initialize if not already
      if (!this.exchange) {
        await this.initialize();
      }

      // 启动行情引擎 / Start market data engine
      this.marketData.start();

      // 启动监控 / Start monitoring
      this.monitor.start();

      // 更新状态 / Update state
      this.state.status = 'running';
      this.state.startTime = Date.now();

      // 发送 PM2 ready 信号 / Send PM2 ready signal
      if (process.send) {
        process.send('ready');
      }

      this.logger.info('[TradingEngine] 交易引擎已启动 / Trading engine started');

      // 发出启动事件 / Emit started event
      this.emit('started');

    } catch (error) {
      this.logger.error('[TradingEngine] 启动失败 / Start failed:', error);
      this.state.status = 'stopped';
      this.state.error = error;
      throw error;
    }
  }

  /**
   * 停止引擎
   * Stop engine
   */
  async stop() {
    // 检查状态 / Check state
    if (this.state.status !== 'running') {
      return;
    }

    this.logger.info('[TradingEngine] 停止交易引擎 / Stopping trading engine');
    this.state.status = 'stopping';

    try {
      // 停止所有策略 / Stop all strategies
      for (const [name] of this.runningStrategies) {
        await this.stopStrategy(name);
      }

      // 取消所有挂单 / Cancel all pending orders
      await this.executor.cancelAllOrders();

      // 停止行情引擎 / Stop market data engine
      this.marketData.stop();

      // 停止监控 / Stop monitoring
      this.monitor.stop();

      // 关闭交易所连接 / Close exchange connection
      if (this.exchange.close) {
        await this.exchange.close();
      }

      // 更新状态 / Update state
      this.state.status = 'stopped';

      this.logger.info('[TradingEngine] 交易引擎已停止 / Trading engine stopped');

      // 发出停止事件 / Emit stopped event
      this.emit('stopped');

    } catch (error) {
      this.logger.error('[TradingEngine] 停止失败 / Stop failed:', error);
      this.state.error = error;
      throw error;
    }
  }

  /**
   * 运行策略
   * Run strategy
   * @param {string} strategyName - 策略名称 / Strategy name
   * @param {Object} strategyConfig - 策略配置 / Strategy configuration
   */
  async runStrategy(strategyName, strategyConfig = {}) {
    this.logger.info(`[TradingEngine] 启动策略 / Starting strategy: ${strategyName}`);

    // 检查策略是否已在运行 / Check if strategy is already running
    if (this.runningStrategies.has(strategyName)) {
      throw new Error(`策略已在运行 / Strategy already running: ${strategyName}`);
    }

    try {
      // 合并默认配置 / Merge default configuration
      const config = {
        ...this.config.strategy.defaults,
        ...this.config.strategy[strategyName],
        ...strategyConfig,
      };

      // 创建策略实例 / Create strategy instance
      const strategy = StrategyRegistry.create(strategyName, config);

      // 设置交易所 / Set exchange
      strategy.setExchange(this.exchange);

      // 初始化策略 / Initialize strategy
      await strategy.initialize();

      // 订阅行情 / Subscribe to market data
      for (const symbol of config.symbols || []) {
        // 订阅 ticker / Subscribe to ticker
        this.marketData.subscribe(symbol, 'ticker');

        // 订阅 K线 / Subscribe to candles
        this.marketData.subscribe(symbol, 'candle', { timeframe: config.timeframe });
      }

      // 绑定策略事件 / Bind strategy events
      this._bindStrategyEvents(strategy);

      // 保存运行中的策略 / Save running strategy
      this.runningStrategies.set(strategyName, {
        strategy,
        config,
        startTime: Date.now(),
      });

      this.logger.info(`[TradingEngine] 策略已启动 / Strategy started: ${strategyName}`);

      // 发出策略启动事件 / Emit strategy started event
      this.emit('strategyStarted', { name: strategyName, config });

    } catch (error) {
      this.logger.error(`[TradingEngine] 策略启动失败 / Strategy start failed: ${strategyName}`, error);
      throw error;
    }
  }

  /**
   * 停止策略
   * Stop strategy
   * @param {string} strategyName - 策略名称 / Strategy name
   */
  async stopStrategy(strategyName) {
    this.logger.info(`[TradingEngine] 停止策略 / Stopping strategy: ${strategyName}`);

    // 检查策略是否在运行 / Check if strategy is running
    const running = this.runningStrategies.get(strategyName);
    if (!running) {
      return;
    }

    try {
      // 取消该策略的订单 / Cancel strategy's orders
      const symbols = running.config.symbols || [];
      for (const symbol of symbols) {
        await this.executor.cancelAllOrders(symbol);
      }

      // 移除运行记录 / Remove running record
      this.runningStrategies.delete(strategyName);

      this.logger.info(`[TradingEngine] 策略已停止 / Strategy stopped: ${strategyName}`);

      // 发出策略停止事件 / Emit strategy stopped event
      this.emit('strategyStopped', { name: strategyName });

    } catch (error) {
      this.logger.error(`[TradingEngine] 策略停止失败 / Strategy stop failed: ${strategyName}`, error);
      throw error;
    }
  }

  /**
   * 获取引擎状态
   * Get engine status
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      // 引擎状态 / Engine state
      status: this.state.status,
      startTime: this.state.startTime,
      uptime: this.state.startTime ? Date.now() - this.state.startTime : 0,
      error: this.state.error?.message,

      // 交易所状态 / Exchange status
      exchange: {
        name: this.config.exchange.default,
        connected: !!this.exchange,
      },

      // 策略状态 / Strategy status
      strategies: Array.from(this.runningStrategies.entries()).map(([name, data]) => ({
        name,
        startTime: data.startTime,
        symbols: data.config.symbols,
      })),

      // 执行器状态 / Executor status
      executor: this.executor?.getStats(),

      // 监控指标 / Monitor metrics
      metrics: this.monitor?.getMetrics(),
    };
  }

  /**
   * 获取账户信息
   * Get account info
   * @returns {Promise<Object>} 账户信息 / Account info
   */
  async getAccountInfo() {
    // 获取余额 / Get balance
    const balance = await this.exchange.fetchBalance();

    // 获取持仓 (期货) / Get positions (futures)
    let positions = [];
    if (this.config.exchange[this.config.exchange.default].defaultType !== 'spot') {
      try {
        positions = await this.exchange.fetchPositions();
      } catch {
        // 现货没有持仓概念 / Spot doesn't have positions
      }
    }

    return {
      balance,
      positions,
    };
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() {
    // 行情事件 -> 策略 / Market data events -> strategies
    this.marketData.on('ticker', (data) => {
      this._onTicker(data);
    });

    this.marketData.on('candle', (data) => {
      this._onCandle(data);
    });

    // 监控事件 -> 告警 / Monitor events -> alerts
    this.monitor.on('warning', async (warning) => {
      await this.alertManager.warning(
        `系统警告 / System Warning: ${warning.type}`,
        warning.message,
        { value: warning.value }
      );
    });

    this.monitor.on('healthChecked', async (health) => {
      if (health.status === 'unhealthy') {
        await this.alertManager.error(
          '系统健康检查失败 / System Health Check Failed',
          `状态: ${health.status}`,
          { checks: health.checks }
        );
      }
    });

    // 执行器事件 -> 监控 / Executor events -> monitor
    this.executor.on('orderFilled', (order) => {
      this.monitor.recordTrade({ success: true, ...order });
    });

    this.executor.on('orderFailed', (order) => {
      this.monitor.recordTrade({ success: false, ...order });
      this.monitor.recordError(new Error(order.error));
    });
  }

  /**
   * 绑定策略事件
   * Bind strategy events
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @private
   */
  _bindStrategyEvents(strategy) {
    // 策略信号 -> 执行 / Strategy signal -> execution
    strategy.on('signal', async (signal) => {
      await this._handleSignal(strategy, signal);
    });

    // 策略错误 -> 监控 / Strategy error -> monitor
    strategy.on('error', (error) => {
      this.monitor.recordError(error);
    });
  }

  /**
   * 处理 ticker 数据
   * Handle ticker data
   * @param {Object} data - ticker 数据 / Ticker data
   * @private
   */
  _onTicker(data) {
    // 传递给所有运行中的策略 / Pass to all running strategies
    for (const [, running] of this.runningStrategies) {
      if (running.config.symbols?.includes(data.symbol)) {
        running.strategy.onTicker?.(data);
      }
    }
  }

  /**
   * 处理 K 线数据
   * Handle candle data
   * @param {Object} data - K 线数据 / Candle data
   * @private
   */
  _onCandle(data) {
    // 传递给所有运行中的策略 / Pass to all running strategies
    for (const [, running] of this.runningStrategies) {
      if (running.config.symbols?.includes(data.symbol)) {
        running.strategy.onCandle?.(data);
      }
    }
  }

  /**
   * 处理策略信号
   * Handle strategy signal
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @param {Object} signal - 信号对象 / Signal object
   * @private
   */
  async _handleSignal(strategy, signal) {
    this.logger.info(`[TradingEngine] 收到信号 / Received signal:`, signal);

    try {
      // 1. 风控检查 / Risk check
      const riskCheck = await this.riskManager.checkOrder({
        symbol: signal.symbol,
        side: signal.side,
        amount: signal.amount,
        price: signal.price,
      });

      if (!riskCheck.allowed) {
        this.logger.warn(`[TradingEngine] 风控拒绝 / Risk rejected:`, riskCheck.reason);
        this.emit('signalRejected', { signal, reason: riskCheck.reason });
        return;
      }

      // 2. 计算仓位大小 / Calculate position size
      const balance = await this.exchange.fetchBalance();
      const totalCapital = balance.total?.USDT || balance.free?.USDT || 0;

      const positionSize = this.positionCalculator.calculate({
        totalCapital,
        entryPrice: signal.price,
        stopLossPrice: signal.stopLoss,
        symbol: signal.symbol,
      });

      // 3. 调整数量 / Adjust amount
      const adjustedAmount = Math.min(signal.amount || positionSize.size, positionSize.size);

      // 4. 执行订单 / Execute order
      const orderParams = {
        symbol: signal.symbol,
        side: signal.side,
        amount: adjustedAmount,
        price: signal.price,
      };

      let result;
      if (signal.type === 'limit') {
        result = await this.executor.executeLimitOrder(orderParams);
      } else {
        result = await this.executor.executeMarketOrder(orderParams);
      }

      // 5. 记录交易 / Record trade
      this.riskManager.recordTrade({
        symbol: signal.symbol,
        side: signal.side,
        amount: adjustedAmount,
        price: result.result?.average || signal.price,
        pnl: 0,  // 开仓时 PnL 为 0 / PnL is 0 when opening
      });

      // 6. 设置止损止盈 / Set stop loss and take profit
      if (signal.stopLoss) {
        // 这里可以添加止损订单逻辑 / Add stop loss order logic here
      }

      if (signal.takeProfit) {
        // 这里可以添加止盈订单逻辑 / Add take profit order logic here
      }

      this.logger.info(`[TradingEngine] 订单执行成功 / Order executed:`, result);
      this.emit('orderExecuted', { signal, result });

    } catch (error) {
      this.logger.error(`[TradingEngine] 信号处理失败 / Signal handling failed:`, error);
      this.monitor.recordError(error);
      this.emit('signalError', { signal, error: error.message });
    }
  }
}

// ============================================
// 主入口 / Main Entry
// ============================================

/**
 * 创建交易引擎实例
 * Create trading engine instance
 * @param {Object} config - 配置对象 / Configuration object
 * @returns {TradingEngine} 交易引擎实例 / Trading engine instance
 */
export function createEngine(config = {}) {
  return new TradingEngine(config);
}

// 默认导出 / Default export
export default TradingEngine;

// ============================================
// 如果作为主模块运行 / If running as main module
// ============================================

// 检查是否为主模块 / Check if main module
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  // 创建引擎实例 / Create engine instance
  const engine = createEngine();

  // 优雅退出处理 / Graceful shutdown handling
  const shutdown = async () => {
    console.log('\n[Main] 收到退出信号，正在关闭... / Received exit signal, shutting down...');
    try {
      await engine.stop();
      console.log('[Main] 引擎已关闭 / Engine stopped');
      process.exit(0);
    } catch (error) {
      console.error('[Main] 关闭失败 / Shutdown failed:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // 启动引擎 / Start engine
  engine.start().then(() => {
    console.log('[Main] 交易引擎已启动 / Trading engine started');
    console.log('[Main] 按 Ctrl+C 停止 / Press Ctrl+C to stop');
  }).catch((error) => {
    console.error('[Main] 启动失败 / Start failed:', error);
    process.exit(1);
  });
}
