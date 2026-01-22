/**
 * 回测引擎
 * Backtesting Engine
 *
 * 提供历史数据回测功能，模拟策略在历史行情中的表现
 * Provides historical data backtesting, simulates strategy performance on historical data
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入高精度计算库 / Import high precision calculation library
import Decimal from 'decimal.js'; // 导入模块 decimal.js

/**
 * 回测引擎类
 * Backtesting Engine Class
 */
export class BacktestEngine extends EventEmitter { // 导出类 BacktestEngine
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 回测配置 / Backtest configuration
    this.config = { // 设置 config
      // 初始资金 / Initial capital
      initialCapital: config.initialCapital || 10000, // 初始资金

      // 手续费率 (0.001 = 0.1%) / Commission rate
      commissionRate: config.commissionRate || 0.001, // 手续费率 (0.001 = 0.1%)

      // 滑点 (0.0005 = 0.05%) / Slippage
      slippage: config.slippage || 0.0005, // 滑点 (0.0005 = 0.05%)

      // 是否允许做空 / Whether to allow short selling
      allowShort: config.allowShort || false, // 允许Short

      // 杠杆倍数 / Leverage
      leverage: config.leverage || 1, // 杠杆

      // 是否使用百分比仓位 / Whether to use percentage position sizing
      usePercentPosition: config.usePercentPosition !== false, // 是否使用百分比仓位
    }; // 结束代码块

    // 回测状态 / Backtest state
    this.state = { // 设置 state
      // 当前资金 / Current capital
      capital: this.config.initialCapital, // 资金

      // 当前持仓 / Current positions
      positions: new Map(), // 持仓

      // 订单历史 / Order history
      orders: [], // 订单

      // 交易历史 / Trade history
      trades: [], // 成交

      // 权益曲线 / Equity curve
      equityCurve: [], // equityCurve

      // 当前 K 线索引 / Current candle index
      currentIndex: 0, // 当前 K 线索引

      // 当前时间 / Current time
      currentTime: null, // current时间

      // 是否正在运行 / Whether running
      running: false, // running

      // ============================================
      // 新增统计跟踪变量 / New statistics tracking variables
      // ============================================

      // 总手续费 / Total commission
      totalCommission: 0, // 总手续费

      // 总交易额 / Total trading volume
      totalTradingVolume: 0, // 总交易成交量

      // 最大仓位比例 / Maximum position ratio
      maxPositionRatio: 0, // 最大仓位比例

      // 风控触发次数 / Risk control trigger count
      riskControlTriggers: 0, // 风控触发次数

      // 日收益率数组 / Daily returns array
      dailyReturns: [], // 日收益率数组

      // 基准权益曲线 (买入持有) / Benchmark equity curve (buy and hold)
      benchmarkEquityCurve: [], // 基准权益曲线 (买入持有)
    }; // 结束代码块

    // 历史数据 / Historical data
    this.data = null; // 设置 data

    // 策略实例 / Strategy instance
    this.strategy = null; // 设置 strategy

    // 统计数据 / Statistics
    this.stats = null; // 设置 stats
  } // 结束代码块

  /**
   * 加载历史数据
   * Load historical data
   * @param {Array} data - K 线数据数组 / Array of candlestick data
   * @returns {BacktestEngine} 返回自身，支持链式调用 / Returns self for chaining
   *
   * 数据格式 / Data format:
   * [{ timestamp, open, high, low, close, volume }, ...]
   */
  loadData(data) { // 调用 loadData
    // 验证数据 / Validate data
    if (!Array.isArray(data) || data.length === 0) { // 条件判断 !Array.isArray(data) || data.length === 0
      throw new Error('数据必须是非空数组 / Data must be a non-empty array'); // 抛出异常
    } // 结束代码块

    // 验证数据格式 / Validate data format
    const requiredFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume']; // 定义常量 requiredFields
    for (const candle of data) { // 循环 const candle of data
      for (const field of requiredFields) { // 循环 const field of requiredFields
        if (candle[field] === undefined) { // 条件判断 candle[field] === undefined
          throw new Error(`数据缺少必要字段: ${field} / Data missing required field: ${field}`); // 抛出异常
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 按时间排序 / Sort by time
    this.data = data.sort((a, b) => a.timestamp - b.timestamp); // 设置 data

    console.log(`[Backtest] 已加载 ${this.data.length} 条 K 线数据 / Loaded ${this.data.length} candles`); // 控制台输出

    return this; // 返回结果
  } // 结束代码块

  /**
   * 设置策略
   * Set strategy
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @returns {BacktestEngine} 返回自身，支持链式调用 / Returns self for chaining
   */
  setStrategy(strategy) { // 调用 setStrategy
    // 验证策略 / Validate strategy
    if (!strategy || typeof strategy.onTick !== 'function') { // 条件判断 !strategy || typeof strategy.onTick !== 'func...
      throw new Error('策略必须实现 onTick 方法 / Strategy must implement onTick method'); // 抛出异常
    } // 结束代码块

    // 设置策略 / Set strategy
    this.strategy = strategy; // 设置 strategy

    // 传递引擎引用给策略 / Pass engine reference to strategy
    this.strategy.engine = this; // 访问 strategy

    console.log(`[Backtest] 已设置策略: ${strategy.name || 'Unknown'} / Strategy set: ${strategy.name || 'Unknown'}`); // 控制台输出

    return this; // 返回结果
  } // 结束代码块

  /**
   * 运行回测
   * Run backtest
   * @returns {Promise<Object>} 回测结果 / Backtest result
   */
  async run() { // 执行语句
    // 验证状态 / Validate state
    if (!this.data) { // 条件判断 !this.data
      throw new Error('请先加载数据 / Please load data first'); // 抛出异常
    } // 结束代码块
    if (!this.strategy) { // 条件判断 !this.strategy
      throw new Error('请先设置策略 / Please set strategy first'); // 抛出异常
    } // 结束代码块

    console.log('[Backtest] 开始回测 / Starting backtest...'); // 控制台输出

    // 重置状态 / Reset state
    this._resetState(); // 调用 _resetState

    // 标记为运行中 / Mark as running
    this.state.running = true; // 访问 state

    // 发出开始事件 / Emit start event
    this.emit('start', { dataLength: this.data.length }); // 调用 emit

    // 调用策略初始化 / Call strategy initialization
    if (typeof this.strategy.onInit === 'function') { // 条件判断 typeof this.strategy.onInit === 'function'
      await this.strategy.onInit(); // 等待异步结果
    } // 结束代码块

    // 遍历每根 K 线 / Iterate each candle
    for (let i = 0; i < this.data.length; i++) { // 循环 let i = 0; i < this.data.length; i++
      // 更新当前状态 / Update current state
      this.state.currentIndex = i; // 访问 state
      this.state.currentTime = this.data[i].timestamp; // 访问 state

      // 获取当前和历史 K 线 / Get current and historical candles
      const candle = this.data[i]; // 定义常量 candle
      const history = this.data.slice(0, i + 1); // 定义常量 history

      // 更新持仓盈亏 / Update position PnL
      this._updatePositionPnL(candle); // 调用 _updatePositionPnL

      // 调用策略 onTick / Call strategy onTick
      try { // 尝试执行
        await this.strategy.onTick(candle, history); // 等待异步结果
      } catch (error) { // 执行语句
        console.error(`[Backtest] 策略执行错误 / Strategy execution error at ${i}:`, error.message); // 控制台输出
        this.emit('error', { index: i, error }); // 调用 emit
      } // 结束代码块

      // 记录权益曲线 / Record equity curve
      this._recordEquity(candle); // 调用 _recordEquity

      // 发出进度事件 / Emit progress event
      if (i % 100 === 0) { // 条件判断 i % 100 === 0
        this.emit('progress', { // 调用 emit
          current: i, // current
          total: this.data.length, // 总
          percent: ((i / this.data.length) * 100).toFixed(2), // 百分比
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 调用策略结束 / Call strategy finish
    if (typeof this.strategy.onFinish === 'function') { // 条件判断 typeof this.strategy.onFinish === 'function'
      await this.strategy.onFinish(); // 等待异步结果
    } // 结束代码块

    // 平掉所有持仓 / Close all positions
    await this._closeAllPositions(); // 等待异步结果

    // 计算统计数据 / Calculate statistics
    this.stats = this._calculateStats(); // 设置 stats

    // 标记为已完成 / Mark as completed
    this.state.running = false; // 访问 state

    // 发出完成事件 / Emit complete event
    this.emit('complete', this.stats); // 调用 emit

    console.log('[Backtest] 回测完成 / Backtest completed'); // 控制台输出

    return this.stats; // 返回结果
  } // 结束代码块

  /**
   * 下单
   * Place order
   * @param {Object} order - 订单参数 / Order parameters
   * @returns {Object} 订单结果 / Order result
   */
  order(order) { // 调用 order
    // 验证订单 / Validate order
    const { symbol, side, amount, type = 'market', price } = order; // 解构赋值

    if (!symbol || !side || !amount) { // 条件判断 !symbol || !side || !amount
      throw new Error('订单缺少必要参数 / Order missing required parameters'); // 抛出异常
    } // 结束代码块

    // 获取当前价格 / Get current price
    const currentCandle = this.data[this.state.currentIndex]; // 定义常量 currentCandle
    let executionPrice; // 定义变量 executionPrice

    // 根据订单类型确定执行价格 / Determine execution price based on order type
    if (type === 'market') { // 条件判断 type === 'market'
      // 市价单使用收盘价 + 滑点 / Market order uses close price + slippage
      const slippageFactor = side === 'buy' ? (1 + this.config.slippage) : (1 - this.config.slippage); // 定义常量 slippageFactor
      executionPrice = new Decimal(currentCandle.close).mul(slippageFactor).toNumber(); // 赋值 executionPrice
    } else if (type === 'limit') { // 执行语句
      // 限价单使用指定价格 / Limit order uses specified price
      if (!price) { // 条件判断 !price
        throw new Error('限价单必须指定价格 / Limit order requires price'); // 抛出异常
      } // 结束代码块
      executionPrice = price; // 赋值 executionPrice
    } // 结束代码块

    // 计算手续费 / Calculate commission
    const orderValue = new Decimal(executionPrice).mul(amount).toNumber(); // 定义常量 orderValue
    const commission = new Decimal(orderValue).mul(this.config.commissionRate).toNumber(); // 定义常量 commission

    // 检查资金是否足够 / Check if capital is sufficient
    if (side === 'buy') { // 条件判断 side === 'buy'
      const requiredCapital = orderValue + commission; // 定义常量 requiredCapital
      if (this.state.capital < requiredCapital) { // 条件判断 this.state.capital < requiredCapital
        console.warn(`[Backtest] 资金不足 / Insufficient capital: need ${requiredCapital}, have ${this.state.capital}`); // 控制台输出
        return null; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 创建订单记录 / Create order record
    const orderRecord = { // 定义常量 orderRecord
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // ID
      symbol, // 执行语句
      side, // 执行语句
      type, // 执行语句
      amount, // 执行语句
      price: executionPrice, // 价格
      value: orderValue, // value
      commission, // 执行语句
      timestamp: this.state.currentTime, // 时间戳
      status: 'filled', // 状态
    }; // 结束代码块

    // 添加到订单历史 / Add to order history
    this.state.orders.push(orderRecord); // 访问 state

    // 记录手续费和交易额 / Record commission and trading volume
    this.state.totalCommission += commission; // 访问 state
    this.state.totalTradingVolume += orderValue; // 访问 state

    // 更新持仓 / Update position
    this._updatePosition(orderRecord); // 调用 _updatePosition

    // 更新资金 / Update capital
    if (side === 'buy') { // 条件判断 side === 'buy'
      this.state.capital -= (orderValue + commission); // 访问 state
    } else { // 执行语句
      this.state.capital += (orderValue - commission); // 访问 state
    } // 结束代码块

    // 发出订单事件 / Emit order event
    this.emit('order', orderRecord); // 调用 emit

    return orderRecord; // 返回结果
  } // 结束代码块

  /**
   * 买入
   * Buy
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单结果 / Order result
   */
  buy(symbol, amount, options = {}) { // 调用 buy
    return this.order({ // 返回结果
      symbol, // 执行语句
      side: 'buy', // 方向
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 卖出
   * Sell
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单结果 / Order result
   */
  sell(symbol, amount, options = {}) { // 调用 sell
    return this.order({ // 返回结果
      symbol, // 执行语句
      side: 'sell', // 方向
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 按百分比买入
   * Buy by percentage
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} percent - 百分比 (0-100) / Percentage
   * @returns {Object} 订单结果 / Order result
   */
  buyPercent(symbol, percent) { // 调用 buyPercent
    // 获取当前价格 / Get current price
    const currentCandle = this.data[this.state.currentIndex]; // 定义常量 currentCandle
    const price = currentCandle.close; // 定义常量 price

    // 计算可买数量 / Calculate buyable amount
    const availableCapital = this.state.capital * (percent / 100); // 定义常量 availableCapital
    const amount = availableCapital / price; // 定义常量 amount

    return this.buy(symbol, amount); // 返回结果
  } // 结束代码块

  /**
   * 平掉指定仓位
   * Close position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 订单结果 / Order result
   */
  closePosition(symbol) { // 调用 closePosition
    // 获取持仓 / Get position
    const position = this.state.positions.get(symbol); // 定义常量 position

    // 如果没有持仓，返回 / If no position, return
    if (!position || position.amount === 0) { // 条件判断 !position || position.amount === 0
      return null; // 返回结果
    } // 结束代码块

    // 根据持仓方向平仓 / Close based on position direction
    if (position.amount > 0) { // 条件判断 position.amount > 0
      return this.sell(symbol, position.amount); // 返回结果
    } else { // 执行语句
      return this.buy(symbol, Math.abs(position.amount)); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取持仓
   * Get position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 持仓信息 / Position info
   */
  getPosition(symbol) { // 调用 getPosition
    return this.state.positions.get(symbol) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取当前资金
   * Get current capital
   * @returns {number} 当前资金 / Current capital
   */
  getCapital() { // 调用 getCapital
    return this.state.capital; // 返回结果
  } // 结束代码块

  /**
   * 获取当前权益
   * Get current equity
   * @returns {number} 当前权益 / Current equity
   */
  getEquity() { // 调用 getEquity
    // 资金 + 持仓价值 / Capital + position value
    let equity = this.state.capital; // 定义变量 equity

    for (const [symbol, position] of this.state.positions) { // 循环 const [symbol, position] of this.state.positions
      if (position.amount !== 0) { // 条件判断 position.amount !== 0
        const currentPrice = this.data[this.state.currentIndex].close; // 定义常量 currentPrice
        equity += position.amount * currentPrice; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return equity; // 返回结果
  } // 结束代码块

  /**
   * 获取当前 K 线
   * Get current candle
   * @returns {Object} 当前 K 线 / Current candle
   */
  getCurrentCandle() { // 调用 getCurrentCandle
    return this.data[this.state.currentIndex]; // 返回结果
  } // 结束代码块

  /**
   * 获取历史 K 线
   * Get historical candles
   * @param {number} count - 数量 / Count
   * @returns {Array} K 线数组 / Candle array
   */
  getHistory(count = 100) { // 调用 getHistory
    const start = Math.max(0, this.state.currentIndex - count + 1); // 定义常量 start
    return this.data.slice(start, this.state.currentIndex + 1); // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 重置状态
   * Reset state
   * @private
   */
  _resetState() { // 调用 _resetState
    this.state = { // 设置 state
      capital: this.config.initialCapital, // 资金
      positions: new Map(), // 持仓
      orders: [], // 订单
      trades: [], // 成交
      equityCurve: [], // equityCurve
      currentIndex: 0, // currentIndex
      currentTime: null, // current时间
      running: false, // running
      // 新增统计跟踪变量 / New statistics tracking variables
      totalCommission: 0, // 新增统计跟踪变量
      totalTradingVolume: 0, // 总交易成交量
      maxPositionRatio: 0, // 最大持仓比例
      riskControlTriggers: 0, // 风险控制Triggers
      dailyReturns: [], // 每日Returns
      benchmarkEquityCurve: [], // benchmarkEquityCurve
    }; // 结束代码块
  } // 结束代码块

  /**
   * 更新持仓
   * Update position
   * @private
   */
  _updatePosition(order) { // 调用 _updatePosition
    // 获取当前持仓 / Get current position
    let position = this.state.positions.get(order.symbol); // 定义变量 position

    // 如果没有持仓，创建新持仓 / If no position, create new one
    if (!position) { // 条件判断 !position
      position = { // 赋值 position
        symbol: order.symbol, // 交易对
        amount: 0, // 数量
        avgPrice: 0, // avg价格
        unrealizedPnL: 0, // 未实现PnL
        realizedPnL: 0, // 已实现PnL
      }; // 结束代码块
      this.state.positions.set(order.symbol, position); // 访问 state
    } // 结束代码块

    // 计算新的持仓量和均价 / Calculate new position amount and average price
    if (order.side === 'buy') { // 条件判断 order.side === 'buy'
      // 买入增加持仓 / Buying increases position
      const newAmount = position.amount + order.amount; // 定义常量 newAmount
      const newCost = position.amount * position.avgPrice + order.amount * order.price; // 定义常量 newCost
      position.avgPrice = newAmount > 0 ? newCost / newAmount : 0; // 赋值 position.avgPrice
      position.amount = newAmount; // 赋值 position.amount
    } else { // 执行语句
      // 卖出减少持仓 / Selling decreases position
      // 计算已实现盈亏 / Calculate realized PnL
      const closedAmount = Math.min(Math.abs(position.amount), order.amount); // 定义常量 closedAmount
      if (position.amount > 0) { // 条件判断 position.amount > 0
        const pnl = closedAmount * (order.price - position.avgPrice); // 定义常量 pnl
        position.realizedPnL += pnl; // 执行语句

        // 记录交易 / Record trade
        this.state.trades.push({ // 访问 state
          symbol: order.symbol, // 交易对
          entryPrice: position.avgPrice, // 入场价格
          exitPrice: order.price, // 出场价格
          amount: closedAmount, // 数量
          pnl, // 执行语句
          timestamp: this.state.currentTime, // 时间戳
        }); // 结束代码块
      } // 结束代码块
      position.amount -= order.amount; // 执行语句
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新持仓盈亏
   * Update position PnL
   * @private
   */
  _updatePositionPnL(candle) { // 调用 _updatePositionPnL
    for (const [symbol, position] of this.state.positions) { // 循环 const [symbol, position] of this.state.positions
      if (position.amount !== 0) { // 条件判断 position.amount !== 0
        // 计算未实现盈亏 / Calculate unrealized PnL
        position.unrealizedPnL = position.amount * (candle.close - position.avgPrice); // 赋值 position.unrealizedPnL
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录权益
   * Record equity
   * @private
   */
  _recordEquity(candle) { // 调用 _recordEquity
    const equity = this.getEquity(); // 定义常量 equity
    this.state.equityCurve.push({ // 访问 state
      timestamp: candle.timestamp, // 时间戳
      equity, // 执行语句
      capital: this.state.capital, // 资金
    }); // 结束代码块

    // 记录基准权益 (买入持有策略) / Record benchmark equity (buy and hold)
    if (this.state.benchmarkEquityCurve.length === 0) { // 条件判断 this.state.benchmarkEquityCurve.length === 0
      // 第一根K线，记录初始价格 / First candle, record initial price
      this._benchmarkInitialPrice = candle.close; // 设置 _benchmarkInitialPrice
    } // 结束代码块
    const benchmarkEquity = this.config.initialCapital * (candle.close / this._benchmarkInitialPrice); // 定义常量 benchmarkEquity
    this.state.benchmarkEquityCurve.push({ // 访问 state
      timestamp: candle.timestamp, // 时间戳
      equity: benchmarkEquity, // equity
    }); // 结束代码块

    // 计算并记录当前仓位比例 / Calculate and record current position ratio
    let positionValue = 0; // 定义变量 positionValue
    for (const [symbol, position] of this.state.positions) { // 循环 const [symbol, position] of this.state.positions
      if (position.amount !== 0) { // 条件判断 position.amount !== 0
        positionValue += Math.abs(position.amount * candle.close); // 执行语句
      } // 结束代码块
    } // 结束代码块
    const positionRatio = equity > 0 ? (positionValue / equity) * 100 : 0; // 定义常量 positionRatio
    if (positionRatio > this.state.maxPositionRatio) { // 条件判断 positionRatio > this.state.maxPositionRatio
      this.state.maxPositionRatio = positionRatio; // 访问 state
    } // 结束代码块
  } // 结束代码块

  /**
   * 平掉所有持仓
   * Close all positions
   * @private
   */
  async _closeAllPositions() { // 执行语句
    for (const [symbol, position] of this.state.positions) { // 循环 const [symbol, position] of this.state.positions
      if (position.amount !== 0) { // 条件判断 position.amount !== 0
        this.closePosition(symbol); // 调用 closePosition
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算统计数据
   * Calculate statistics
   * @private
   */
  _calculateStats() { // 调用 _calculateStats
    // 基础数据 / Basic data
    const initialCapital = this.config.initialCapital; // 定义常量 initialCapital
    const finalEquity = this.getEquity(); // 定义常量 finalEquity
    const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100; // 定义常量 totalReturn

    // 计算回测天数 / Calculate backtest days
    let days = 0; // 定义变量 days
    if (this.data && this.data.length >= 2) { // 条件判断 this.data && this.data.length >= 2
      const startTime = this.data[0].timestamp; // 定义常量 startTime
      const endTime = this.data[this.data.length - 1].timestamp; // 定义常量 endTime
      days = (endTime - startTime) / (1000 * 60 * 60 * 24); // 赋值 days
    } // 结束代码块

    // 计算年化收益 / Calculate annualized return
    let annualReturn = 0; // 定义变量 annualReturn
    if (days > 0) { // 条件判断 days > 0
      const totalReturnDecimal = totalReturn / 100; // 定义常量 totalReturnDecimal
      annualReturn = (Math.pow(1 + totalReturnDecimal, 365 / days) - 1) * 100; // 赋值 annualReturn
    } // 结束代码块

    // 交易统计 / Trade statistics
    const totalTrades = this.state.trades.length; // 定义常量 totalTrades
    const winningTrades = this.state.trades.filter(t => t.pnl > 0); // 定义函数 winningTrades
    const losingTrades = this.state.trades.filter(t => t.pnl < 0); // 定义函数 losingTrades
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0; // 定义常量 winRate

    // 盈亏统计 / PnL statistics
    const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0); // 定义函数 totalProfit
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0)); // 定义函数 totalLoss
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0; // 定义常量 profitFactor

    // 平均盈亏 / Average PnL
    const avgWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0; // 定义常量 avgWin
    const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0; // 定义常量 avgLoss

    // 最大回撤 / Maximum drawdown
    const { maxDrawdown, maxDrawdownPercent } = this._calculateMaxDrawdown(); // 解构赋值

    // 夏普比率 / Sharpe ratio
    const sharpeRatio = this._calculateSharpeRatio(); // 定义常量 sharpeRatio

    // ============================================
    // 新增指标计算 / New metrics calculation
    // ============================================

    // 3. Calmar比率 = 年化收益 / 最大回撤
    const calmarRatio = maxDrawdownPercent > 0 ? annualReturn / maxDrawdownPercent : 0; // 定义常量 calmarRatio

    // 5. 换手率（年化）= (总交易额 / 平均资金) * (365 / 天数)
    const avgCapital = (initialCapital + finalEquity) / 2; // 定义常量 avgCapital
    const turnoverRate = days > 0 && avgCapital > 0 // 定义常量 turnoverRate
      ? (this.state.totalTradingVolume / avgCapital) * (365 / days) * 100 // 执行语句
      : 0; // 执行语句

    // 6. 交易成本率 = 总手续费 / 初始资金 * 100
    const tradingCostRate = (this.state.totalCommission / initialCapital) * 100; // 定义常量 tradingCostRate

    // 9. 实盘vs回测收益偏差 (暂时设为null，需要实盘数据)
    const liveVsBacktestDeviation = null; // 定义常量 liveVsBacktestDeviation

    // 10. 样本外年化 (使用后30%数据计算)
    const outOfSampleReturn = this._calculateOutOfSampleReturn(); // 定义常量 outOfSampleReturn

    // 11. IC均值 (因子策略指标，暂时设为null)
    const icMean = null; // 定义常量 icMean

    // 12. ICIR (因子策略指标，暂时设为null)
    const icir = null; // 定义常量 icir

    // 13. 策略容量预估（亿）- 基于平均交易量估算
    const capacityEstimate = this._calculateCapacityEstimate(); // 定义常量 capacityEstimate

    // 14. 前10持仓占比 (单标的策略，设为100%)
    const top10HoldingRatio = 100; // 定义常量 top10HoldingRatio

    // 15. 单只最大仓位
    const maxPositionRatio = this.state.maxPositionRatio; // 定义常量 maxPositionRatio

    // 16. 日均成交额占比 (需要市场总成交额数据，暂时设为null)
    const avgDailyVolumeRatio = null; // 定义常量 avgDailyVolumeRatio

    // 17. 风控触发次数
    const riskControlTriggers = this.state.riskControlTriggers; // 定义常量 riskControlTriggers

    // 18. 资金曲线相关系数 (与基准的相关性)
    const equityCurveCorrelation = this._calculateCorrelation(); // 定义常量 equityCurveCorrelation

    // 构建统计结果 / Build statistics result
    return { // 返回结果
      // ============================================
      // 账户统计 / Account statistics
      // ============================================
      initialCapital,                    // 初始资金 / Initial capital
      finalEquity,                       // 最终权益 / Final equity
      totalReturn,                       // 总收益率 (%) / Total return (%)
      annualReturn,                      // 年化收益率 (%) / Annual return (%)
      totalReturnAmount: finalEquity - initialCapital,  // 总收益额 / Total return amount

      // ============================================
      // 交易统计 / Trade statistics
      // ============================================
      totalTrades,                       // 总交易次数 / Total trades
      winningTrades: winningTrades.length,   // 盈利次数 / Winning trades
      losingTrades: losingTrades.length,     // 亏损次数 / Losing trades
      winRate,                           // 胜率 (%) / Win rate (%)

      // ============================================
      // 盈亏分析 / PnL analysis
      // ============================================
      totalProfit,                       // 总盈利 / Total profit
      totalLoss,                         // 总亏损 / Total loss
      profitFactor,                      // 盈亏比 / Profit factor
      avgWin,                            // 平均盈利 / Average win
      avgLoss,                           // 平均亏损 / Average loss

      // ============================================
      // 风险指标 / Risk metrics
      // ============================================
      maxDrawdown,                       // 最大回撤 / Maximum drawdown
      maxDrawdownPercent,                // 最大回撤百分比 / Maximum drawdown percent
      sharpeRatio,                       // 夏普比率 / Sharpe ratio
      calmarRatio,                       // Calmar比率 / Calmar ratio

      // ============================================
      // 新增18项指标 / New 18 metrics
      // ============================================
      turnoverRate,                      // 5. 换手率（年化）% / Turnover rate (annualized)
      tradingCostRate,                   // 6. 交易成本率 % / Trading cost rate
      liveVsBacktestDeviation,           // 9. 实盘vs回测收益偏差 / Live vs backtest deviation
      outOfSampleReturn,                 // 10. 样本外年化 % / Out-of-sample annual return
      icMean,                            // 11. IC均值 / IC mean
      icir,                              // 12. ICIR
      capacityEstimate,                  // 13. 策略容量预估（亿）/ Capacity estimate (100M)
      top10HoldingRatio,                 // 14. 前10持仓占比 % / Top 10 holding ratio
      maxPositionRatio,                  // 15. 单只最大仓位 % / Max position ratio
      avgDailyVolumeRatio,               // 16. 日均成交额占比 / Avg daily volume ratio
      riskControlTriggers,               // 17. 风控触发次数 / Risk control triggers
      equityCurveCorrelation,            // 18. 资金曲线相关系数 / Equity curve correlation

      // ============================================
      // 费用统计 / Fee statistics
      // ============================================
      totalCommission: this.state.totalCommission,  // 总手续费 / Total commission
      totalTradingVolume: this.state.totalTradingVolume,  // 总交易额 / Total trading volume

      // ============================================
      // 原始数据 / Raw data
      // ============================================
      equityCurve: this.state.equityCurve,   // 权益曲线 / Equity curve
      benchmarkEquityCurve: this.state.benchmarkEquityCurve,  // 基准曲线 / Benchmark curve
      trades: this.state.trades,         // 交易列表 / Trade list
      orders: this.state.orders,         // 订单列表 / Order list
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算最大回撤
   * Calculate maximum drawdown
   * @private
   */
  _calculateMaxDrawdown() { // 调用 _calculateMaxDrawdown
    let peak = 0; // 定义变量 peak
    let maxDrawdown = 0; // 定义变量 maxDrawdown
    let maxDrawdownPercent = 0; // 定义变量 maxDrawdownPercent

    for (const point of this.state.equityCurve) { // 循环 const point of this.state.equityCurve
      // 更新峰值 / Update peak
      if (point.equity > peak) { // 条件判断 point.equity > peak
        peak = point.equity; // 赋值 peak
      } // 结束代码块

      // 计算回撤 / Calculate drawdown
      const drawdown = peak - point.equity; // 定义常量 drawdown
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0; // 定义常量 drawdownPercent

      // 更新最大回撤 / Update maximum drawdown
      if (drawdown > maxDrawdown) { // 条件判断 drawdown > maxDrawdown
        maxDrawdown = drawdown; // 赋值 maxDrawdown
        maxDrawdownPercent = drawdownPercent; // 赋值 maxDrawdownPercent
      } // 结束代码块
    } // 结束代码块

    return { maxDrawdown, maxDrawdownPercent }; // 返回结果
  } // 结束代码块

  /**
   * 计算夏普比率
   * Calculate Sharpe ratio
   * @private
   */
  _calculateSharpeRatio() { // 调用 _calculateSharpeRatio
    // 如果权益曲线点数太少，返回 0 / If too few equity curve points, return 0
    if (this.state.equityCurve.length < 2) { // 条件判断 this.state.equityCurve.length < 2
      return 0; // 返回结果
    } // 结束代码块

    // 计算日收益率 / Calculate daily returns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < this.state.equityCurve.length; i++) { // 循环 let i = 1; i < this.state.equityCurve.length;...
      const prevEquity = this.state.equityCurve[i - 1].equity; // 定义常量 prevEquity
      const currEquity = this.state.equityCurve[i].equity; // 定义常量 currEquity
      const returnRate = (currEquity - prevEquity) / prevEquity; // 定义常量 returnRate
      returns.push(returnRate); // 调用 returns.push
    } // 结束代码块

    // 计算平均收益率 / Calculate average return
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length; // 定义函数 avgReturn

    // 计算标准差 / Calculate standard deviation
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length; // 定义函数 variance
    const stdDev = Math.sqrt(variance); // 定义常量 stdDev

    // 计算夏普比率 (假设无风险利率为 0) / Calculate Sharpe ratio (assuming risk-free rate is 0)
    // 年化: 假设 252 个交易日 / Annualized: assuming 252 trading days
    const annualizedReturn = avgReturn * 252; // 定义常量 annualizedReturn
    const annualizedStdDev = stdDev * Math.sqrt(252); // 定义常量 annualizedStdDev

    return annualizedStdDev > 0 ? annualizedReturn / annualizedStdDev : 0; // 返回结果
  } // 结束代码块

  /**
   * 计算样本外年化收益
   * Calculate out-of-sample annual return
   * 使用后30%的数据计算 / Uses last 30% of data
   * @private
   */
  _calculateOutOfSampleReturn() { // 调用 _calculateOutOfSampleReturn
    if (!this.state.equityCurve || this.state.equityCurve.length < 10) { // 条件判断 !this.state.equityCurve || this.state.equityC...
      return 0; // 返回结果
    } // 结束代码块

    // 取后30%的数据 / Get last 30% of data
    const splitIndex = Math.floor(this.state.equityCurve.length * 0.7); // 定义常量 splitIndex
    const outOfSampleCurve = this.state.equityCurve.slice(splitIndex); // 定义常量 outOfSampleCurve

    if (outOfSampleCurve.length < 2) { // 条件判断 outOfSampleCurve.length < 2
      return 0; // 返回结果
    } // 结束代码块

    // 计算样本外收益 / Calculate out-of-sample return
    const startEquity = outOfSampleCurve[0].equity; // 定义常量 startEquity
    const endEquity = outOfSampleCurve[outOfSampleCurve.length - 1].equity; // 定义常量 endEquity
    const oosReturn = ((endEquity - startEquity) / startEquity) * 100; // 定义常量 oosReturn

    // 计算样本外天数 / Calculate out-of-sample days
    const startTime = outOfSampleCurve[0].timestamp; // 定义常量 startTime
    const endTime = outOfSampleCurve[outOfSampleCurve.length - 1].timestamp; // 定义常量 endTime
    const days = (endTime - startTime) / (1000 * 60 * 60 * 24); // 定义常量 days

    // 年化 / Annualize
    if (days > 0) { // 条件判断 days > 0
      const oosReturnDecimal = oosReturn / 100; // 定义常量 oosReturnDecimal
      return (Math.pow(1 + oosReturnDecimal, 365 / days) - 1) * 100; // 返回结果
    } // 结束代码块

    return 0; // 返回结果
  } // 结束代码块

  /**
   * 计算策略容量预估
   * Calculate strategy capacity estimate
   * 基于平均每日交易量和市场冲击成本估算 / Based on avg daily volume and market impact
   * @private
   */
  _calculateCapacityEstimate() { // 调用 _calculateCapacityEstimate
    if (!this.data || this.data.length === 0) { // 条件判断 !this.data || this.data.length === 0
      return 0; // 返回结果
    } // 结束代码块

    // 计算平均日成交量 / Calculate average daily volume
    const totalVolume = this.data.reduce((sum, candle) => sum + (candle.volume || 0), 0); // 定义函数 totalVolume
    const avgDailyVolume = totalVolume / this.data.length * 24; // 假设1小时K线

    // 假设策略交易量不超过市场日均成交量的1% / Assume strategy volume <= 1% of market daily volume
    // 按平均价格估算容量 / Estimate capacity by average price
    const avgPrice = this.data.reduce((sum, c) => sum + c.close, 0) / this.data.length; // 定义函数 avgPrice
    const capacityUSD = avgDailyVolume * avgPrice * 0.01; // 定义常量 capacityUSD

    // 转换为亿 / Convert to 100 million
    return capacityUSD / 100000000; // 返回结果
  } // 结束代码块

  /**
   * 计算资金曲线与基准的相关系数
   * Calculate correlation between equity curve and benchmark
   * @private
   */
  _calculateCorrelation() { // 调用 _calculateCorrelation
    const equity = this.state.equityCurve; // 定义常量 equity
    const benchmark = this.state.benchmarkEquityCurve; // 定义常量 benchmark

    if (!equity || !benchmark || equity.length < 2 || benchmark.length !== equity.length) { // 条件判断 !equity || !benchmark || equity.length < 2 ||...
      return 0; // 返回结果
    } // 结束代码块

    // 提取收益率序列 / Extract return series
    const equityReturns = []; // 定义常量 equityReturns
    const benchmarkReturns = []; // 定义常量 benchmarkReturns

    for (let i = 1; i < equity.length; i++) { // 循环 let i = 1; i < equity.length; i++
      const eqReturn = (equity[i].equity - equity[i - 1].equity) / equity[i - 1].equity; // 定义常量 eqReturn
      const bmReturn = (benchmark[i].equity - benchmark[i - 1].equity) / benchmark[i - 1].equity; // 定义常量 bmReturn
      equityReturns.push(eqReturn); // 调用 equityReturns.push
      benchmarkReturns.push(bmReturn); // 调用 benchmarkReturns.push
    } // 结束代码块

    if (equityReturns.length === 0) { // 条件判断 equityReturns.length === 0
      return 0; // 返回结果
    } // 结束代码块

    // 计算均值 / Calculate means
    const eqMean = equityReturns.reduce((a, b) => a + b, 0) / equityReturns.length; // 定义函数 eqMean
    const bmMean = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length; // 定义函数 bmMean

    // 计算协方差和标准差 / Calculate covariance and standard deviations
    let covariance = 0; // 定义变量 covariance
    let eqVariance = 0; // 定义变量 eqVariance
    let bmVariance = 0; // 定义变量 bmVariance

    for (let i = 0; i < equityReturns.length; i++) { // 循环 let i = 0; i < equityReturns.length; i++
      const eqDiff = equityReturns[i] - eqMean; // 定义常量 eqDiff
      const bmDiff = benchmarkReturns[i] - bmMean; // 定义常量 bmDiff
      covariance += eqDiff * bmDiff; // 执行语句
      eqVariance += eqDiff * eqDiff; // 执行语句
      bmVariance += bmDiff * bmDiff; // 执行语句
    } // 结束代码块

    const eqStdDev = Math.sqrt(eqVariance / equityReturns.length); // 定义常量 eqStdDev
    const bmStdDev = Math.sqrt(bmVariance / benchmarkReturns.length); // 定义常量 bmStdDev

    // 计算相关系数 / Calculate correlation coefficient
    if (eqStdDev === 0 || bmStdDev === 0) { // 条件判断 eqStdDev === 0 || bmStdDev === 0
      return 0; // 返回结果
    } // 结束代码块

    return covariance / (equityReturns.length * eqStdDev * bmStdDev); // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default BacktestEngine; // 默认导出
