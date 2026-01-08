/**
 * 策略基类
 * Base Strategy Class
 *
 * 所有交易策略的基础类，定义策略的标准接口
 * Base class for all trading strategies, defines standard interface
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

/**
 * 策略基类
 * Base Strategy Class
 */
export class BaseStrategy extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 策略名称 / Strategy name
    this.name = params.name || 'BaseStrategy';

    // 策略参数 / Strategy parameters
    this.params = params;

    // 回测/交易引擎引用 / Backtest/trading engine reference
    this.engine = null;

    // 策略状态 / Strategy state
    this.state = {
      // 是否已初始化 / Whether initialized
      initialized: false,

      // 当前信号 / Current signal
      signal: null,

      // 上一个信号 / Previous signal
      lastSignal: null,

      // 自定义状态数据 / Custom state data
      data: {},
    };

    // 指标缓存 / Indicator cache
    this.indicators = {};
  }

  /**
   * 初始化方法 - 在回测/交易开始前调用
   * Initialization method - called before backtest/trading starts
   * @returns {Promise<void>}
   */
  async onInit() {
    // 标记为已初始化 / Mark as initialized
    this.state.initialized = true;

    // 发出初始化事件 / Emit initialization event
    this.emit('initialized');

    console.log(`[${this.name}] 策略初始化完成 / Strategy initialized`);
  }

  /**
   * 每个 K 线/tick 触发的方法 - 子类必须实现
   * Method triggered on each candle/tick - must be implemented by subclass
   * @param {Object} candle - 当前 K 线数据 / Current candle data
   * @param {Array} history - 历史 K 线数据 / Historical candle data
   * @returns {Promise<void>}
   */
  async onTick(candle, history) {
    // 抽象方法，子类必须实现 / Abstract method, must be implemented by subclass
    throw new Error('onTick() 方法必须由子类实现 / onTick() must be implemented by subclass');
  }

  /**
   * 初始化 K 线历史数据 - 在启动时由 main.js 调用
   * Initialize candle history - called by main.js at startup
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} candles - 历史 K 线数据 (CCXT OHLCV 格式) / Historical candle data (CCXT OHLCV format)
   */
  initCandleHistory(symbol, candles) {
    // 初始化历史数组 / Initialize history array
    if (!this._candleHistory) {
      this._candleHistory = [];
    }

    // 将 CCXT OHLCV 格式转换为策略格式并添加到历史
    // Convert CCXT OHLCV format to strategy format and add to history
    // CCXT 格式: [timestamp, open, high, low, close, volume]
    for (const ohlcv of candles) {
      const candle = {
        symbol: symbol,
        timestamp: ohlcv[0],
        open: ohlcv[1],
        high: ohlcv[2],
        low: ohlcv[3],
        close: ohlcv[4],
        volume: ohlcv[5],
      };
      this._candleHistory.push(candle);
    }

    // 保留最近 200 根 K 线 / Keep last 200 candles
    if (this._candleHistory.length > 200) {
      this._candleHistory = this._candleHistory.slice(-200);
    }

    this.log(`已加载 ${candles.length} 根历史 K 线 (${symbol}) / Loaded ${candles.length} historical candles`);
  }

  /**
   * K 线更新事件处理 - 实盘/影子模式下由 main.js 调用
   * Candle update event handler - called by main.js in live/shadow mode
   * @param {Object} data - K 线数据 / Candle data
   * @returns {Promise<void>}
   */
  async onCandle(data) {
    // 将 K 线数据转换为 onTick 格式并调用
    // Convert candle data to onTick format and call
    try {
      // 调试日志: 仅在 DEBUG 模式下打印 / Debug log: only print in DEBUG mode
      // 通过环境变量 LOG_LEVEL=debug 启用 / Enable via LOG_LEVEL=debug env var
      if (process.env.LOG_LEVEL === 'debug') {
        this.log(`[DEBUG] onCandle 收到数据: ${data.symbol}, close=${data.close}`);
      }

      // 构建 candle 对象 / Build candle object
      const candle = {
        symbol: data.symbol,
        timestamp: data.timestamp || Date.now(),
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
      };

      // 获取历史数据 (如果有) / Get history data (if available)
      const history = this._candleHistory || [];

      // 保存到历史 / Save to history
      if (!this._candleHistory) {
        this._candleHistory = [];
      }
      this._candleHistory.push(candle);

      // 保留最近 200 根 K 线 / Keep last 200 candles
      if (this._candleHistory.length > 200) {
        this._candleHistory.shift();
      }

      // 调用 onTick / Call onTick
      await this.onTick(candle, this._candleHistory);

    } catch (error) {
      // 忽略未实现 onTick 的错误 / Ignore unimplemented onTick error
      if (!error.message.includes('必须由子类实现') && !error.message.includes('must be implemented')) {
        this.log(`onCandle 错误: ${error.message}`, 'error');
      }
    }
  }

  /**
   * Ticker 更新事件处理 - 实盘/影子模式下由 main.js 调用
   * Ticker update event handler - called by main.js in live/shadow mode
   * @param {Object} data - Ticker 数据 / Ticker data
   * @returns {Promise<void>}
   */
  async onTicker(data) {
    // Ticker 事件用于实时价格更新，子类可覆盖
    // Ticker event for real-time price updates, subclass can override
    // 默认不做处理，避免过于频繁调用 onTick
    // Default does nothing to avoid calling onTick too frequently
  }

  /**
   * 资金费率更新事件处理 - 实盘/影子模式下由 main.js 调用
   * Funding rate update event handler - called by main.js in live/shadow mode
   * @param {Object} data - 资金费率数据 / Funding rate data
   * @returns {Promise<void>}
   */
  async onFundingRate(data) {
    // 资金费率事件，主要用于资金费率套利策略
    // Funding rate event, mainly for funding rate arbitrage strategy
    // 默认不做处理，子类可覆盖 / Default does nothing, subclass can override
  }

  /**
   * 结束方法 - 在回测/交易结束时调用
   * Finish method - called when backtest/trading ends
   * @returns {Promise<void>}
   */
  async onFinish() {
    // 发出结束事件 / Emit finish event
    this.emit('finished');

    console.log(`[${this.name}] 策略执行完成 / Strategy execution completed`);
  }

  /**
   * 订单成交回调
   * Order filled callback
   * @param {Object} order - 订单信息 / Order information
   */
  onOrderFilled(order) {
    // 默认不做处理，子类可覆盖 / Default does nothing, subclass can override
    this.emit('orderFilled', order);
  }

  /**
   * 订单取消回调
   * Order cancelled callback
   * @param {Object} order - 订单信息 / Order information
   */
  onOrderCancelled(order) {
    // 默认不做处理，子类可覆盖 / Default does nothing, subclass can override
    this.emit('orderCancelled', order);
  }

  /**
   * 错误回调
   * Error callback
   * @param {Error} error - 错误对象 / Error object
   */
  onError(error) {
    // 发出错误事件 / Emit error event
    this.emit('error', error);

    console.error(`[${this.name}] 错误 / Error:`, error.message);
  }

  // ============================================
  // 信号方法 / Signal Methods
  // ============================================

  /**
   * 设置买入信号
   * Set buy signal
   *
   * 注意: 此方法只记录信号状态，不触发交易
   * 实际交易应通过 buy() / buyPercent() 方法执行
   * Note: This method only records signal state, does not trigger trade
   * Actual trade should be executed via buy() / buyPercent() methods
   *
   * @param {string} reason - 信号原因 / Signal reason
   */
  setBuySignal(reason = '') {
    this.state.lastSignal = this.state.signal;
    this.state.signal = {
      type: 'buy',
      side: 'buy',
      reason,
      timestamp: Date.now(),
    };
    // 不再发出信号事件，避免与 buy()/buyPercent() 重复
    // No longer emit signal event to avoid duplication with buy()/buyPercent()
  }

  /**
   * 设置卖出信号
   * Set sell signal
   *
   * 注意: 此方法只记录信号状态，不触发交易
   * 实际交易应通过 sell() / closePosition() 方法执行
   * Note: This method only records signal state, does not trigger trade
   * Actual trade should be executed via sell() / closePosition() methods
   *
   * @param {string} reason - 信号原因 / Signal reason
   */
  setSellSignal(reason = '') {
    this.state.lastSignal = this.state.signal;
    this.state.signal = {
      type: 'sell',
      side: 'sell',
      reason,
      timestamp: Date.now(),
    };
    // 不再发出信号事件，避免与 sell()/closePosition() 重复
    // No longer emit signal event to avoid duplication with sell()/closePosition()
  }

  /**
   * 清除信号
   * Clear signal
   */
  clearSignal() {
    this.state.lastSignal = this.state.signal;
    this.state.signal = null;
  }

  /**
   * 获取当前信号
   * Get current signal
   * @returns {Object|null} 当前信号 / Current signal
   */
  getSignal() {
    return this.state.signal;
  }

  // ============================================
  // 便捷交易方法 / Convenient Trading Methods
  // ============================================

  /**
   * 买入
   * Buy
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object|null} 订单结果 / Order result
   */
  buy(symbol, amount, options = {}) {
    if (!this.engine) {
      console.error(`[${this.name}] 引擎未设置 / Engine not set`);
      return null;
    }
    // 链路日志: 策略发出买入信号 / Chain log: Strategy emits buy signal
    this.log(`[链路] 策略发出买入信号: ${symbol} 数量=${amount} / Strategy buy signal`, 'info');
    return this.engine.buy(symbol, amount, options);
  }

  /**
   * 卖出
   * Sell
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object|null} 订单结果 / Order result
   */
  sell(symbol, amount, options = {}) {
    if (!this.engine) {
      console.error(`[${this.name}] 引擎未设置 / Engine not set`);
      return null;
    }
    // 链路日志: 策略发出卖出信号 / Chain log: Strategy emits sell signal
    this.log(`[链路] 策略发出卖出信号: ${symbol} 数量=${amount} / Strategy sell signal`, 'info');
    return this.engine.sell(symbol, amount, options);
  }

  /**
   * 按百分比买入
   * Buy by percentage
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} percent - 百分比 / Percentage
   * @returns {Object|null} 订单结果 / Order result
   */
  buyPercent(symbol, percent) {
    if (!this.engine) {
      console.error(`[${this.name}] 引擎未设置 / Engine not set`);
      return null;
    }
    // 链路日志: 策略发出按比例买入信号 / Chain log: Strategy emits buyPercent signal
    this.log(`[链路] 策略发出买入信号(按比例): ${symbol} 比例=${percent}% / Strategy buyPercent signal`, 'info');
    return this.engine.buyPercent(symbol, percent);
  }

  /**
   * 平仓
   * Close position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 订单结果 / Order result
   */
  closePosition(symbol) {
    if (!this.engine) {
      console.error(`[${this.name}] 引擎未设置 / Engine not set`);
      return null;
    }
    // 链路日志: 策略发出平仓信号 / Chain log: Strategy emits close position signal
    this.log(`[链路] 策略发出平仓信号: ${symbol} / Strategy closePosition signal`, 'info');
    return this.engine.closePosition(symbol);
  }

  /**
   * 获取持仓
   * Get position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 持仓信息 / Position info
   */
  getPosition(symbol) {
    if (!this.engine) {
      return null;
    }
    return this.engine.getPosition(symbol);
  }

  /**
   * 获取当前资金
   * Get current capital
   * @returns {number} 当前资金 / Current capital
   */
  getCapital() {
    if (!this.engine) {
      return 0;
    }
    return this.engine.getCapital();
  }

  /**
   * 获取当前权益
   * Get current equity
   * @returns {number} 当前权益 / Current equity
   */
  getEquity() {
    if (!this.engine) {
      return 0;
    }
    return this.engine.getEquity();
  }

  /**
   * 获取策略所需的所有交易对
   * Get all symbols required by the strategy
   *
   * 子类可覆盖此方法以声明额外需要订阅的交易对
   * Subclasses can override this method to declare additional symbols to subscribe
   *
   * @returns {Array<string>} 交易对列表 / Symbol list
   */
  getRequiredSymbols() {
    // 默认返回空数组，由 main.js 合并策略参数中的 symbols
    // Default returns empty array, main.js will merge with symbols from strategy params
    return [];
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   *
   * 可用类型 / Available types:
   * - 'ticker': 实时价格 / Real-time price
   * - 'depth': 深度/订单簿 / Order book
   * - 'trade': 成交数据 / Trade data
   * - 'fundingRate': 资金费率 / Funding rate
   * - 'kline': K线数据 / Candlestick data
   *
   * 子类应覆盖此方法以声明实际需要的数据类型
   * Subclasses should override this method to declare required data types
   *
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 默认返回所有类型以保持向后兼容
    // Default returns all types for backward compatibility
    return ['ticker', 'depth', 'trade', 'fundingRate', 'kline'];
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 设置状态数据
   * Set state data
   * @param {string} key - 键 / Key
   * @param {*} value - 值 / Value
   */
  setState(key, value) {
    this.state.data[key] = value;
  }

  /**
   * 获取状态数据
   * Get state data
   * @param {string} key - 键 / Key
   * @param {*} defaultValue - 默认值 / Default value
   * @returns {*} 值 / Value
   */
  getState(key, defaultValue = null) {
    return this.state.data[key] !== undefined ? this.state.data[key] : defaultValue;
  }

  /**
   * 设置指标值
   * Set indicator value
   * @param {string} name - 指标名称 / Indicator name
   * @param {*} value - 指标值 / Indicator value
   */
  setIndicator(name, value) {
    this.indicators[name] = value;
  }

  /**
   * 获取指标值
   * Get indicator value
   * @param {string} name - 指标名称 / Indicator name
   * @returns {*} 指标值 / Indicator value
   */
  getIndicator(name) {
    return this.indicators[name];
  }

  /**
   * 日志输出
   * Log output
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.name}]`;

    switch (level) {
      case 'error':
        console.error(`${prefix} ERROR:`, message);
        break;
      case 'warn':
        console.warn(`${prefix} WARN:`, message);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.log(`${prefix} DEBUG:`, message);
        }
        break;
      default:
        console.log(`${prefix} INFO:`, message);
    }
  }
}

// 导出默认类 / Export default class
export default BaseStrategy;
