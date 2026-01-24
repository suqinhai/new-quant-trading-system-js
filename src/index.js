/**
 * 量化交易系统主入口
 * Quant Trading System Main Entry
 *
 * 整合所有模块，提供统一的系统入口
 * Integrates all modules and provides unified system entry point
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config'; // 加载模块 dotenv/config

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入交易所模块 / Import exchange module
import { ExchangeFactory } from './exchange/index.js'; // 导入模块 ./exchange/index.js

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './marketdata/index.js'; // 导入模块 ./marketdata/index.js

// 导入策略模块 / Import strategy module
import { StrategyRegistry } from './strategies/index.js'; // 导入模块 ./strategies/index.js

// 导入风控模块 / Import risk module
import { RiskManager, PositionCalculator } from './risk/index.js'; // 导入模块 ./risk/index.js

// 导入订单执行器 / Import order executor
import { OrderExecutor } from './executor/index.js'; // 导入模块 ./executor/index.js

// 导入监控模块 / Import monitor module
import { SystemMonitor, AlertManager } from './monitor/index.js'; // 导入模块 ./monitor/index.js

// 导入配置 / Import configuration
import { loadConfig } from '../config/index.js'; // 导入模块 ../config/index.js

// 导入工具函数 / Import utilities
import { logger, formatDate, sleep } from './utils/index.js'; // 导入模块 ./utils/index.js

// 导入因子库 / Import factor library
import * as Factors from './factors/index.js'; // 导入模块 ./factors/index.js

/**
 * 量化交易引擎
 * Quant Trading Engine
 */
export class TradingEngine extends EventEmitter { // 导出类 TradingEngine
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = loadConfig(config); // 设置 config

    // 引擎状态 / Engine state
    this.state = { // 设置 state
      status: 'stopped',    // 状态
      startTime: null,      // 启动时间 / Start time
      error: null,          // 最后错误 / Last error
    }; // 结束代码块

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
    this.runningStrategies = new Map(); // 设置 runningStrategies

    // 日志记录器 / Logger
    this.logger = logger; // 设置 logger
  } // 结束代码块

  /**
   * 初始化引擎
   * Initialize engine
   */
  async initialize() { // 执行语句
    this.logger.info('[TradingEngine] 初始化交易引擎 / Initializing trading engine'); // 访问 logger

    try { // 尝试执行
      // 1. 创建交易所实例 / Create exchange instance
      this.logger.info('[TradingEngine] 创建交易所连接 / Creating exchange connection'); // 访问 logger
      const sharedBalance = this.config.account?.sharedBalance || this.config.sharedBalance; // Shared balance config
      const exchangeConfig = { // Exchange config
        ...this.config.exchange[this.config.exchange.default], // Base exchange config
        sharedBalance: sharedBalance || undefined, // Shared balance
        redis: this.config.database?.redis, // Redis config
      };

      this.exchange = ExchangeFactory.create( // 设置 exchange
        this.config.exchange.default, // 访问 config
        exchangeConfig // 访问 config
      ); // 结束调用或参数

      // 加载市场信息 / Load market info
      await this.exchange.loadMarkets(); // 等待异步结果
      this.logger.info('[TradingEngine] 交易所连接成功 / Exchange connected'); // 访问 logger

      // 2. 创建行情引擎 / Create market data engine
      this.logger.info('[TradingEngine] 初始化行情引擎 / Initializing market data engine'); // 访问 logger
      this.marketData = new MarketDataEngine(this.exchange, this.config.marketData); // 设置 marketData

      // 3. 创建风控管理器 / Create risk manager
      this.logger.info('[TradingEngine] 初始化风控模块 / Initializing risk module'); // 访问 logger
      this.riskManager = new RiskManager(this.config.risk); // 设置 riskManager
      this.positionCalculator = new PositionCalculator(this.config.risk); // 设置 positionCalculator

      // 4. 创建订单执行器 / Create order executor
      this.logger.info('[TradingEngine] 初始化订单执行器 / Initializing order executor'); // 访问 logger
      this.executor = new OrderExecutor(this.exchange, this.config.executor); // 设置 executor

      // 5. 创建监控模块 / Create monitor module
      this.logger.info('[TradingEngine] 初始化监控模块 / Initializing monitor module'); // 访问 logger
      this.monitor = new SystemMonitor(this.config.monitor); // 设置 monitor
      this.alertManager = new AlertManager(this.config.alert); // 设置 alertManager

      // 6. 绑定事件 / Bind events
      this._bindEvents(); // 调用 _bindEvents

      this.logger.info('[TradingEngine] 初始化完成 / Initialization complete'); // 访问 logger

      // 发出初始化完成事件 / Emit initialized event
      this.emit('initialized'); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error('[TradingEngine] 初始化失败 / Initialization failed:', error); // 访问 logger
      this.state.error = error; // 访问 state
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动引擎
   * Start engine
   */
  async start() { // 执行语句
    // 检查状态 / Check state
    if (this.state.status !== 'stopped') { // 条件判断 this.state.status !== 'stopped'
      throw new Error('引擎已在运行 / Engine is already running'); // 抛出异常
    } // 结束代码块

    this.logger.info('[TradingEngine] 启动交易引擎 / Starting trading engine'); // 访问 logger
    this.state.status = 'starting'; // 访问 state

    try { // 尝试执行
      // 初始化 (如果尚未初始化) / Initialize if not already
      if (!this.exchange) { // 条件判断 !this.exchange
        await this.initialize(); // 等待异步结果
      } // 结束代码块

      // 启动行情引擎 / Start market data engine
      this.marketData.start(); // 访问 marketData

      // 启动监控 / Start monitoring
      this.monitor.start(); // 访问 monitor

      // 更新状态 / Update state
      this.state.status = 'running'; // 访问 state
      this.state.startTime = Date.now(); // 访问 state

      // 发送 PM2 ready 信号 / Send PM2 ready signal
      if (process.send) { // 条件判断 process.send
        process.send('ready'); // 调用 process.send
      } // 结束代码块

      this.logger.info('[TradingEngine] 交易引擎已启动 / Trading engine started'); // 访问 logger

      // 发出启动事件 / Emit started event
      this.emit('started'); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error('[TradingEngine] 启动失败 / Start failed:', error); // 访问 logger
      this.state.status = 'stopped'; // 访问 state
      this.state.error = error; // 访问 state
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止引擎
   * Stop engine
   */
  async stop() { // 执行语句
    // 检查状态 / Check state
    if (this.state.status !== 'running') { // 条件判断 this.state.status !== 'running'
      return; // 返回结果
    } // 结束代码块

    this.logger.info('[TradingEngine] 停止交易引擎 / Stopping trading engine'); // 访问 logger
    this.state.status = 'stopping'; // 访问 state

    try { // 尝试执行
      // 停止所有策略 / Stop all strategies
      for (const [name] of this.runningStrategies) { // 循环 const [name] of this.runningStrategies
        await this.stopStrategy(name); // 等待异步结果
      } // 结束代码块

      // 取消所有挂单 / Cancel all pending orders
      await this.executor.cancelAllOrders(); // 等待异步结果

      // 停止行情引擎 / Stop market data engine
      this.marketData.stop(); // 访问 marketData

      // 停止监控 / Stop monitoring
      this.monitor.stop(); // 访问 monitor

      // 关闭交易所连接 / Close exchange connection
      if (this.exchange.close) { // 条件判断 this.exchange.close
        await this.exchange.close(); // 等待异步结果
      } // 结束代码块

      // 更新状态 / Update state
      this.state.status = 'stopped'; // 访问 state

      this.logger.info('[TradingEngine] 交易引擎已停止 / Trading engine stopped'); // 访问 logger

      // 发出停止事件 / Emit stopped event
      this.emit('stopped'); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error('[TradingEngine] 停止失败 / Stop failed:', error); // 访问 logger
      this.state.error = error; // 访问 state
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 运行策略
   * Run strategy
   * @param {string} strategyName - 策略名称 / Strategy name
   * @param {Object} strategyConfig - 策略配置 / Strategy configuration
   */
  async runStrategy(strategyName, strategyConfig = {}) { // 执行语句
    this.logger.info(`[TradingEngine] 启动策略 / Starting strategy: ${strategyName}`); // 访问 logger

    // 检查策略是否已在运行 / Check if strategy is already running
    if (this.runningStrategies.has(strategyName)) { // 条件判断 this.runningStrategies.has(strategyName)
      throw new Error(`策略已在运行 / Strategy already running: ${strategyName}`); // 抛出异常
    } // 结束代码块

    try { // 尝试执行
      // 合并默认配置 / Merge default configuration
      const config = { // 定义常量 config
        ...this.config.strategy.defaults, // 展开对象或数组
        ...this.config.strategy[strategyName], // 展开对象或数组
        ...strategyConfig, // 展开对象或数组
      }; // 结束代码块

      // 创建策略实例 / Create strategy instance
      const strategy = StrategyRegistry.create(strategyName, config); // 定义常量 strategy

      // 设置交易所 / Set exchange
      strategy.setExchange(this.exchange); // 调用 strategy.setExchange

      // 初始化策略 / Initialize strategy
      await strategy.initialize(); // 等待异步结果

      // 订阅行情 / Subscribe to market data
      for (const symbol of config.symbols || []) { // 循环 const symbol of config.symbols || []
        // 订阅 ticker / Subscribe to ticker
        this.marketData.subscribe(symbol, 'ticker'); // 访问 marketData

        // 订阅 K线 / Subscribe to candles
        this.marketData.subscribe(symbol, 'candle', { timeframe: config.timeframe }); // 访问 marketData
      } // 结束代码块

      // 绑定策略事件 / Bind strategy events
      this._bindStrategyEvents(strategy); // 调用 _bindStrategyEvents

      // 保存运行中的策略 / Save running strategy
      this.runningStrategies.set(strategyName, { // 访问 runningStrategies
        strategy, // 执行语句
        config, // 执行语句
        startTime: Date.now(), // 启动时间
      }); // 结束代码块

      this.logger.info(`[TradingEngine] 策略已启动 / Strategy started: ${strategyName}`); // 访问 logger

      // 发出策略启动事件 / Emit strategy started event
      this.emit('strategyStarted', { name: strategyName, config }); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error(`[TradingEngine] 策略启动失败 / Strategy start failed: ${strategyName}`, error); // 访问 logger
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止策略
   * Stop strategy
   * @param {string} strategyName - 策略名称 / Strategy name
   */
  async stopStrategy(strategyName) { // 执行语句
    this.logger.info(`[TradingEngine] 停止策略 / Stopping strategy: ${strategyName}`); // 访问 logger

    // 检查策略是否在运行 / Check if strategy is running
    const running = this.runningStrategies.get(strategyName); // 定义常量 running
    if (!running) { // 条件判断 !running
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 取消该策略的订单 / Cancel strategy's orders
      const symbols = running.config.symbols || []; // 定义常量 symbols
      for (const symbol of symbols) { // 循环 const symbol of symbols
        await this.executor.cancelAllOrders(symbol); // 等待异步结果
      } // 结束代码块

      // 移除运行记录 / Remove running record
      this.runningStrategies.delete(strategyName); // 访问 runningStrategies

      this.logger.info(`[TradingEngine] 策略已停止 / Strategy stopped: ${strategyName}`); // 访问 logger

      // 发出策略停止事件 / Emit strategy stopped event
      this.emit('strategyStopped', { name: strategyName }); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error(`[TradingEngine] 策略停止失败 / Strategy stop failed: ${strategyName}`, error); // 访问 logger
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取引擎状态
   * Get engine status
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      // 引擎状态 / Engine state
      status: this.state.status, // 状态引擎状态
      startTime: this.state.startTime, // 启动时间
      uptime: this.state.startTime ? Date.now() - this.state.startTime : 0, // uptime
      error: this.state.error?.message, // 错误

      // 交易所状态 / Exchange status
      exchange: { // 交易所交易所状态
        name: this.config.exchange.default, // name
        connected: !!this.exchange, // connected
      }, // 结束代码块

      // 策略状态 / Strategy status
      strategies: Array.from(this.runningStrategies.entries()).map(([name, data]) => ({ // 策略策略状态
        name, // 执行语句
        startTime: data.startTime, // 启动时间
        symbols: data.config.symbols, // 交易对列表
      })), // 结束代码块

      // 执行器状态 / Executor status
      executor: this.executor?.getStats(), // executor执行器状态

      // 监控指标 / Monitor metrics
      metrics: this.monitor?.getMetrics(), // 指标
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取账户信息
   * Get account info
   * @returns {Promise<Object>} 账户信息 / Account info
   */
  async getAccountInfo() { // 执行语句
    // 获取余额 / Get balance
    const balance = await this.exchange.fetchBalance(); // 定义常量 balance

    // 获取持仓 (期货) / Get positions (futures)
    let positions = []; // 定义变量 positions
    if (this.config.exchange[this.config.exchange.default].defaultType !== 'spot') { // 条件判断 this.config.exchange[this.config.exchange.def...
      try { // 尝试执行
        positions = await this.exchange.fetchPositions(); // 赋值 positions
      } catch { // 执行语句
        // 现货没有持仓概念 / Spot doesn't have positions
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      balance, // 执行语句
      positions, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() { // 调用 _bindEvents
    // 行情事件 -> 策略 / Market data events -> strategies
    this.marketData.on('ticker', (data) => { // 访问 marketData
      this._onTicker(data); // 调用 _onTicker
    }); // 结束代码块

    this.marketData.on('candle', (data) => { // 访问 marketData
      this._onCandle(data); // 调用 _onCandle
    }); // 结束代码块

    // 监控事件 -> 告警 / Monitor events -> alerts
    this.monitor.on('warning', async (warning) => { // 访问 monitor
      await this.alertManager.warning( // 等待异步结果
        `系统警告 / System Warning: ${warning.type}`, // 执行语句
        warning.message, // 执行语句
        { value: warning.value } // 执行语句
      ); // 结束调用或参数
    }); // 结束代码块

    this.monitor.on('healthChecked', async (health) => { // 访问 monitor
      if (health.status === 'unhealthy') { // 条件判断 health.status === 'unhealthy'
        await this.alertManager.error( // 等待异步结果
          '系统健康检查失败 / System Health Check Failed', // 执行语句
          `状态: ${health.status}`, // 执行语句
          { checks: health.checks } // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    }); // 结束代码块

    // 执行器事件 -> 监控 / Executor events -> monitor
    this.executor.on('orderFilled', (order) => { // 访问 executor
      this.monitor.recordTrade({ success: true, ...order }); // 访问 monitor
    }); // 结束代码块

    this.executor.on('orderFailed', (order) => { // 访问 executor
      this.monitor.recordTrade({ success: false, ...order }); // 访问 monitor
      this.monitor.recordError(new Error(order.error)); // 访问 monitor
    }); // 结束代码块
  } // 结束代码块

  /**
   * 绑定策略事件
   * Bind strategy events
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @private
   */
  _bindStrategyEvents(strategy) { // 调用 _bindStrategyEvents
    // 策略信号 -> 执行 / Strategy signal -> execution
    strategy.on('signal', async (signal) => { // 注册事件监听
      await this._handleSignal(strategy, signal); // 等待异步结果
    }); // 结束代码块

    // 策略错误 -> 监控 / Strategy error -> monitor
    strategy.on('error', (error) => { // 注册事件监听
      this.monitor.recordError(error); // 访问 monitor
    }); // 结束代码块
  } // 结束代码块

  /**
   * 处理 ticker 数据
   * Handle ticker data
   * @param {Object} data - ticker 数据 / Ticker data
   * @private
   */
  _onTicker(data) { // 调用 _onTicker
    // 传递给所有运行中的策略 / Pass to all running strategies
    for (const [, running] of this.runningStrategies) { // 循环 const [, running] of this.runningStrategies
      if (running.config.symbols?.includes(data.symbol)) { // 条件判断 running.config.symbols?.includes(data.symbol)
        running.strategy.onTicker?.(data); // 执行语句
        this._logStrategyScore(running.strategy, 'ticker', data); // 记录得分日志
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 K 线数据
   * Handle candle data
   * @param {Object} data - K 线数据 / Candle data
   * @private
   */
  _onCandle(data) { // 调用 _onCandle
    // 传递给所有运行中的策略 / Pass to all running strategies
    for (const [, running] of this.runningStrategies) { // 循环 const [, running] of this.runningStrategies
      if (running.config.symbols?.includes(data.symbol)) { // 条件判断 running.config.symbols?.includes(data.symbol)
        running.strategy.onCandle?.(data); // 执行语句
        this._logStrategyScore(running.strategy, 'candle', data); // 记录得分日志
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  _logStrategyScore(strategy, dataType, data) { // 记录策略得分
    if (!strategy) { // 条件判断 !strategy
      return; // 返回结果
    } // 结束代码块
    const name = strategy.name || strategy.constructor?.name || 'strategy'; // 定义常量 name
    const symbol = data?.symbol || 'n/a'; // 定义常量 symbol
    const exchange = data?.exchange || this.config?.exchange?.default || 'n/a'; // 定义常量 exchange
    const scores = this._collectStrategyScores(strategy); // 定义常量 scores
    const scoreText = scores ? this._formatScoreSnapshot(scores) : 'score=n/a'; // 定义常量 scoreText
    this.logger.info(`[score] ${name} ${dataType} ${exchange}:${symbol} ${scoreText}`); // 访问 logger
  } // 结束代码块

  _collectStrategyScores(strategy) { // 收集策略得分
    const scores = {}; // 定义常量 scores
    const addScore = (key, value) => { // 定义函数 addScore
      if (Number.isFinite(value)) { // 条件判断 Number.isFinite(value)
        scores[key] = value; // 访问 scores
      } // 结束代码块
    }; // 结束代码块

    if (Number.isFinite(strategy.score)) { // 条件判断 Number.isFinite(strategy.score)
      addScore('score', strategy.score); // 调用 addScore
    } // 结束代码块

    if (typeof strategy.getScore === 'function') { // 条件判断 typeof strategy.getScore === 'function'
      try { // 尝试执行
        const value = strategy.getScore(); // 定义常量 value
        if (Number.isFinite(value)) { // 条件判断 Number.isFinite(value)
          addScore('score', value); // 调用 addScore
        } else if (value && typeof value === 'object') { // 条件判断 value && typeof value === 'object'
          for (const [key, val] of Object.entries(value)) { // 循环 const [key, val] of Object.entries(value)
            addScore(key, val); // 调用 addScore
          } // 结束代码块
        } // 结束代码块
      } catch { // 执行语句
        // Ignore score errors
      } // 结束代码块
    } // 结束代码块

    const indicators = strategy.indicators && typeof strategy.indicators === 'object' // 定义常量 indicators
      ? strategy.indicators // 执行语句
      : {}; // 执行语句
    for (const [key, val] of Object.entries(indicators)) { // 循环 const [key, val] of Object.entries(indicators)
      if (key && key.toLowerCase().includes('score')) { // 条件判断 key && key.toLowerCase().includes('score')
        addScore(key, val); // 调用 addScore
      } // 结束代码块
    } // 结束代码块

    const stateData = strategy.state?.data && typeof strategy.state.data === 'object' // 定义常量 stateData
      ? strategy.state.data // 执行语句
      : {}; // 执行语句
    for (const [key, val] of Object.entries(stateData)) { // 循环 const [key, val] of Object.entries(stateData)
      if (key && key.toLowerCase().includes('score')) { // 条件判断 key && key.toLowerCase().includes('score')
        addScore(key, val); // 调用 addScore
      } // 结束代码块
    } // 结束代码块

    return Object.keys(scores).length > 0 ? scores : null; // 返回结果
  } // 结束代码块

  _formatScoreSnapshot(scores) { // 格式化得分日志
    const entries = Object.entries(scores); // 定义常量 entries
    if (entries.length === 0) { // 条件判断 entries.length === 0
      return 'score=n/a'; // 返回结果
    } // 结束代码块
    const parts = []; // 定义常量 parts
    for (const [key, value] of entries.slice(0, 6)) { // 循环 const [key, value] of entries.slice(0, 6)
      const num = Number(value); // 定义常量 num
      if (!Number.isFinite(num)) { // 条件判断 !Number.isFinite(num)
        continue; // 继续下一轮循环
      } // 结束代码块
      parts.push(`${key}=${num.toFixed(4)}`); // 调用 parts.push
    } // 结束代码块
    if (parts.length === 0) { // 条件判断 parts.length === 0
      return 'score=n/a'; // 返回结果
    } // 结束代码块
    const suffix = entries.length > 6 ? ' ...' : ''; // 定义常量 suffix
    return `${parts.join(' ')}${suffix}`.trim(); // 返回结果
  } // 结束代码块

  /**
   * 处理策略信号
   * Handle strategy signal
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @param {Object} signal - 信号对象 / Signal object
   * @private
   */
  async _handleSignal(strategy, signal) { // 执行语句
    this.logger.info(`[TradingEngine] 收到信号 / Received signal:`, signal); // 访问 logger

    try { // 尝试执行
      // 1. 风控检查 / Risk check
      const riskCheck = await this.riskManager.checkOrder({ // 定义常量 riskCheck
        symbol: signal.symbol, // 交易对
        side: signal.side, // 方向
        amount: signal.amount, // 数量
        price: signal.price, // 价格
      }); // 结束代码块

      if (!riskCheck.allowed) { // 条件判断 !riskCheck.allowed
        this.logger.warn(`[TradingEngine] 风控拒绝 / Risk rejected:`, riskCheck.reason); // 访问 logger
        this.emit('signalRejected', { signal, reason: riskCheck.reason }); // 调用 emit
        return; // 返回结果
      } // 结束代码块

      // 2. 计算仓位大小 / Calculate position size
      const balance = await this.exchange.fetchBalance(); // 定义常量 balance
      const totalCapital = balance.total?.USDT || balance.free?.USDT || 0; // 定义常量 totalCapital

      const positionSize = this.positionCalculator.calculate({ // 定义常量 positionSize
        totalCapital, // 执行语句
        entryPrice: signal.price, // 入场价格
        stopLossPrice: signal.stopLoss, // 止损价格
        symbol: signal.symbol, // 交易对
      }); // 结束代码块

      // 3. 调整数量 / Adjust amount
      const adjustedAmount = Math.min(signal.amount || positionSize.size, positionSize.size); // 定义常量 adjustedAmount

      // 4. 执行订单 / Execute order
      const orderParams = { // 定义常量 orderParams
        symbol: signal.symbol, // 交易对
        side: signal.side, // 方向
        amount: adjustedAmount, // 数量
        price: signal.price, // 价格
      }; // 结束代码块

      let result; // 定义变量 result
      if (signal.type === 'limit') { // 条件判断 signal.type === 'limit'
        result = await this.executor.executeLimitOrder(orderParams); // 赋值 result
      } else { // 执行语句
        result = await this.executor.executeMarketOrder(orderParams); // 赋值 result
      } // 结束代码块

      // 5. 记录交易 / Record trade
      this.riskManager.recordTrade({ // 访问 riskManager
        symbol: signal.symbol, // 交易对
        side: signal.side, // 方向
        amount: adjustedAmount, // 数量
        price: result.result?.average || signal.price, // 价格
        pnl: 0,  // 开仓时 PnL 为 0 / PnL is 0 when opening
      }); // 结束代码块

      // 6. 设置止损止盈 / Set stop loss and take profit
      if (signal.stopLoss) { // 条件判断 signal.stopLoss
        // 这里可以添加止损订单逻辑 / Add stop loss order logic here
      } // 结束代码块

      if (signal.takeProfit) { // 条件判断 signal.takeProfit
        // 这里可以添加止盈订单逻辑 / Add take profit order logic here
      } // 结束代码块

      this.logger.info(`[TradingEngine] 订单执行成功 / Order executed:`, result); // 访问 logger
      this.emit('orderExecuted', { signal, result }); // 调用 emit

    } catch (error) { // 执行语句
      this.logger.error(`[TradingEngine] 信号处理失败 / Signal handling failed:`, error); // 访问 logger
      this.monitor.recordError(error); // 访问 monitor
      this.emit('signalError', { signal, error: error.message }); // 调用 emit
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主入口 / Main Entry
// ============================================

/**
 * 创建交易引擎实例
 * Create trading engine instance
 * @param {Object} config - 配置对象 / Configuration object
 * @returns {TradingEngine} 交易引擎实例 / Trading engine instance
 */
export function createEngine(config = {}) { // 导出函数 createEngine
  return new TradingEngine(config); // 返回结果
} // 结束代码块

// 导出因子库 / Export factor library
export { Factors }; // 导出命名成员

// 默认导出 / Default export
export default TradingEngine; // 默认导出

// ============================================
// 如果作为主模块运行 / If running as main module
// ============================================

// 检查是否为主模块 / Check if main module
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`; // 定义常量 isMainModule

if (isMainModule) { // 条件判断 isMainModule
  // 创建引擎实例 / Create engine instance
  const engine = createEngine(); // 定义常量 engine

  // 优雅退出处理 / Graceful shutdown handling
  const shutdown = async () => { // 定义函数 shutdown
    console.log('\n[Main] 收到退出信号，正在关闭... / Received exit signal, shutting down...'); // 控制台输出
    try { // 尝试执行
      await engine.stop(); // 等待异步结果
      console.log('[Main] 引擎已关闭 / Engine stopped'); // 控制台输出
      process.exit(0); // 退出进程
    } catch (error) { // 执行语句
      console.error('[Main] 关闭失败 / Shutdown failed:', error); // 控制台输出
      process.exit(1); // 退出进程
    } // 结束代码块
  }; // 结束代码块

  process.on('SIGTERM', shutdown); // 注册事件监听
  process.on('SIGINT', shutdown); // 注册事件监听

  // 启动引擎 / Start engine
  engine.start().then(() => { // 调用 engine.start
    console.log('[Main] 交易引擎已启动 / Trading engine started'); // 控制台输出
    console.log('[Main] 按 Ctrl+C 停止 / Press Ctrl+C to stop'); // 控制台输出
  }).catch((error) => { // 定义箭头函数
    console.error('[Main] 启动失败 / Start failed:', error); // 控制台输出
    process.exit(1); // 退出进程
  }); // 结束代码块
} // 结束代码块

