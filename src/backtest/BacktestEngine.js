/**
 * 回测引擎
 * Backtesting Engine
 *
 * 提供历史数据回测功能，模拟策略在历史行情中的表现
 * Provides historical data backtesting, simulates strategy performance on historical data
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入高精度计算库 / Import high precision calculation library
import Decimal from 'decimal.js';

/**
 * 回测引擎类
 * Backtesting Engine Class
 */
export class BacktestEngine extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 回测配置 / Backtest configuration
    this.config = {
      // 初始资金 / Initial capital
      initialCapital: config.initialCapital || 10000,

      // 手续费率 (0.001 = 0.1%) / Commission rate
      commissionRate: config.commissionRate || 0.001,

      // 滑点 (0.0005 = 0.05%) / Slippage
      slippage: config.slippage || 0.0005,

      // 是否允许做空 / Whether to allow short selling
      allowShort: config.allowShort || false,

      // 杠杆倍数 / Leverage
      leverage: config.leverage || 1,

      // 是否使用百分比仓位 / Whether to use percentage position sizing
      usePercentPosition: config.usePercentPosition !== false,
    };

    // 回测状态 / Backtest state
    this.state = {
      // 当前资金 / Current capital
      capital: this.config.initialCapital,

      // 当前持仓 / Current positions
      positions: new Map(),

      // 订单历史 / Order history
      orders: [],

      // 交易历史 / Trade history
      trades: [],

      // 权益曲线 / Equity curve
      equityCurve: [],

      // 当前 K 线索引 / Current candle index
      currentIndex: 0,

      // 当前时间 / Current time
      currentTime: null,

      // 是否正在运行 / Whether running
      running: false,
    };

    // 历史数据 / Historical data
    this.data = null;

    // 策略实例 / Strategy instance
    this.strategy = null;

    // 统计数据 / Statistics
    this.stats = null;
  }

  /**
   * 加载历史数据
   * Load historical data
   * @param {Array} data - K 线数据数组 / Array of candlestick data
   * @returns {BacktestEngine} 返回自身，支持链式调用 / Returns self for chaining
   *
   * 数据格式 / Data format:
   * [{ timestamp, open, high, low, close, volume }, ...]
   */
  loadData(data) {
    // 验证数据 / Validate data
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('数据必须是非空数组 / Data must be a non-empty array');
    }

    // 验证数据格式 / Validate data format
    const requiredFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    for (const candle of data) {
      for (const field of requiredFields) {
        if (candle[field] === undefined) {
          throw new Error(`数据缺少必要字段: ${field} / Data missing required field: ${field}`);
        }
      }
    }

    // 按时间排序 / Sort by time
    this.data = data.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[Backtest] 已加载 ${this.data.length} 条 K 线数据 / Loaded ${this.data.length} candles`);

    return this;
  }

  /**
   * 设置策略
   * Set strategy
   * @param {Object} strategy - 策略实例 / Strategy instance
   * @returns {BacktestEngine} 返回自身，支持链式调用 / Returns self for chaining
   */
  setStrategy(strategy) {
    // 验证策略 / Validate strategy
    if (!strategy || typeof strategy.onTick !== 'function') {
      throw new Error('策略必须实现 onTick 方法 / Strategy must implement onTick method');
    }

    // 设置策略 / Set strategy
    this.strategy = strategy;

    // 传递引擎引用给策略 / Pass engine reference to strategy
    this.strategy.engine = this;

    console.log(`[Backtest] 已设置策略: ${strategy.name || 'Unknown'} / Strategy set: ${strategy.name || 'Unknown'}`);

    return this;
  }

  /**
   * 运行回测
   * Run backtest
   * @returns {Promise<Object>} 回测结果 / Backtest result
   */
  async run() {
    // 验证状态 / Validate state
    if (!this.data) {
      throw new Error('请先加载数据 / Please load data first');
    }
    if (!this.strategy) {
      throw new Error('请先设置策略 / Please set strategy first');
    }

    console.log('[Backtest] 开始回测 / Starting backtest...');

    // 重置状态 / Reset state
    this._resetState();

    // 标记为运行中 / Mark as running
    this.state.running = true;

    // 发出开始事件 / Emit start event
    this.emit('start', { dataLength: this.data.length });

    // 调用策略初始化 / Call strategy initialization
    if (typeof this.strategy.onInit === 'function') {
      await this.strategy.onInit();
    }

    // 遍历每根 K 线 / Iterate each candle
    for (let i = 0; i < this.data.length; i++) {
      // 更新当前状态 / Update current state
      this.state.currentIndex = i;
      this.state.currentTime = this.data[i].timestamp;

      // 获取当前和历史 K 线 / Get current and historical candles
      const candle = this.data[i];
      const history = this.data.slice(0, i + 1);

      // 更新持仓盈亏 / Update position PnL
      this._updatePositionPnL(candle);

      // 调用策略 onTick / Call strategy onTick
      try {
        await this.strategy.onTick(candle, history);
      } catch (error) {
        console.error(`[Backtest] 策略执行错误 / Strategy execution error at ${i}:`, error.message);
        this.emit('error', { index: i, error });
      }

      // 记录权益曲线 / Record equity curve
      this._recordEquity(candle);

      // 发出进度事件 / Emit progress event
      if (i % 100 === 0) {
        this.emit('progress', {
          current: i,
          total: this.data.length,
          percent: ((i / this.data.length) * 100).toFixed(2),
        });
      }
    }

    // 调用策略结束 / Call strategy finish
    if (typeof this.strategy.onFinish === 'function') {
      await this.strategy.onFinish();
    }

    // 平掉所有持仓 / Close all positions
    await this._closeAllPositions();

    // 计算统计数据 / Calculate statistics
    this.stats = this._calculateStats();

    // 标记为已完成 / Mark as completed
    this.state.running = false;

    // 发出完成事件 / Emit complete event
    this.emit('complete', this.stats);

    console.log('[Backtest] 回测完成 / Backtest completed');

    return this.stats;
  }

  /**
   * 下单
   * Place order
   * @param {Object} order - 订单参数 / Order parameters
   * @returns {Object} 订单结果 / Order result
   */
  order(order) {
    // 验证订单 / Validate order
    const { symbol, side, amount, type = 'market', price } = order;

    if (!symbol || !side || !amount) {
      throw new Error('订单缺少必要参数 / Order missing required parameters');
    }

    // 获取当前价格 / Get current price
    const currentCandle = this.data[this.state.currentIndex];
    let executionPrice;

    // 根据订单类型确定执行价格 / Determine execution price based on order type
    if (type === 'market') {
      // 市价单使用收盘价 + 滑点 / Market order uses close price + slippage
      const slippageFactor = side === 'buy' ? (1 + this.config.slippage) : (1 - this.config.slippage);
      executionPrice = new Decimal(currentCandle.close).mul(slippageFactor).toNumber();
    } else if (type === 'limit') {
      // 限价单使用指定价格 / Limit order uses specified price
      if (!price) {
        throw new Error('限价单必须指定价格 / Limit order requires price');
      }
      executionPrice = price;
    }

    // 计算手续费 / Calculate commission
    const orderValue = new Decimal(executionPrice).mul(amount).toNumber();
    const commission = new Decimal(orderValue).mul(this.config.commissionRate).toNumber();

    // 检查资金是否足够 / Check if capital is sufficient
    if (side === 'buy') {
      const requiredCapital = orderValue + commission;
      if (this.state.capital < requiredCapital) {
        console.warn(`[Backtest] 资金不足 / Insufficient capital: need ${requiredCapital}, have ${this.state.capital}`);
        return null;
      }
    }

    // 创建订单记录 / Create order record
    const orderRecord = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      side,
      type,
      amount,
      price: executionPrice,
      value: orderValue,
      commission,
      timestamp: this.state.currentTime,
      status: 'filled',
    };

    // 添加到订单历史 / Add to order history
    this.state.orders.push(orderRecord);

    // 更新持仓 / Update position
    this._updatePosition(orderRecord);

    // 更新资金 / Update capital
    if (side === 'buy') {
      this.state.capital -= (orderValue + commission);
    } else {
      this.state.capital += (orderValue - commission);
    }

    // 发出订单事件 / Emit order event
    this.emit('order', orderRecord);

    return orderRecord;
  }

  /**
   * 买入
   * Buy
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单结果 / Order result
   */
  buy(symbol, amount, options = {}) {
    return this.order({
      symbol,
      side: 'buy',
      amount,
      ...options,
    });
  }

  /**
   * 卖出
   * Sell
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单结果 / Order result
   */
  sell(symbol, amount, options = {}) {
    return this.order({
      symbol,
      side: 'sell',
      amount,
      ...options,
    });
  }

  /**
   * 按百分比买入
   * Buy by percentage
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} percent - 百分比 (0-100) / Percentage
   * @returns {Object} 订单结果 / Order result
   */
  buyPercent(symbol, percent) {
    // 获取当前价格 / Get current price
    const currentCandle = this.data[this.state.currentIndex];
    const price = currentCandle.close;

    // 计算可买数量 / Calculate buyable amount
    const availableCapital = this.state.capital * (percent / 100);
    const amount = availableCapital / price;

    return this.buy(symbol, amount);
  }

  /**
   * 平掉指定仓位
   * Close position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 订单结果 / Order result
   */
  closePosition(symbol) {
    // 获取持仓 / Get position
    const position = this.state.positions.get(symbol);

    // 如果没有持仓，返回 / If no position, return
    if (!position || position.amount === 0) {
      return null;
    }

    // 根据持仓方向平仓 / Close based on position direction
    if (position.amount > 0) {
      return this.sell(symbol, position.amount);
    } else {
      return this.buy(symbol, Math.abs(position.amount));
    }
  }

  /**
   * 获取持仓
   * Get position
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 持仓信息 / Position info
   */
  getPosition(symbol) {
    return this.state.positions.get(symbol) || null;
  }

  /**
   * 获取当前资金
   * Get current capital
   * @returns {number} 当前资金 / Current capital
   */
  getCapital() {
    return this.state.capital;
  }

  /**
   * 获取当前权益
   * Get current equity
   * @returns {number} 当前权益 / Current equity
   */
  getEquity() {
    // 资金 + 持仓价值 / Capital + position value
    let equity = this.state.capital;

    for (const [symbol, position] of this.state.positions) {
      if (position.amount !== 0) {
        const currentPrice = this.data[this.state.currentIndex].close;
        equity += position.amount * currentPrice;
      }
    }

    return equity;
  }

  /**
   * 获取当前 K 线
   * Get current candle
   * @returns {Object} 当前 K 线 / Current candle
   */
  getCurrentCandle() {
    return this.data[this.state.currentIndex];
  }

  /**
   * 获取历史 K 线
   * Get historical candles
   * @param {number} count - 数量 / Count
   * @returns {Array} K 线数组 / Candle array
   */
  getHistory(count = 100) {
    const start = Math.max(0, this.state.currentIndex - count + 1);
    return this.data.slice(start, this.state.currentIndex + 1);
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 重置状态
   * Reset state
   * @private
   */
  _resetState() {
    this.state = {
      capital: this.config.initialCapital,
      positions: new Map(),
      orders: [],
      trades: [],
      equityCurve: [],
      currentIndex: 0,
      currentTime: null,
      running: false,
    };
  }

  /**
   * 更新持仓
   * Update position
   * @private
   */
  _updatePosition(order) {
    // 获取当前持仓 / Get current position
    let position = this.state.positions.get(order.symbol);

    // 如果没有持仓，创建新持仓 / If no position, create new one
    if (!position) {
      position = {
        symbol: order.symbol,
        amount: 0,
        avgPrice: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
      };
      this.state.positions.set(order.symbol, position);
    }

    // 计算新的持仓量和均价 / Calculate new position amount and average price
    if (order.side === 'buy') {
      // 买入增加持仓 / Buying increases position
      const newAmount = position.amount + order.amount;
      const newCost = position.amount * position.avgPrice + order.amount * order.price;
      position.avgPrice = newAmount > 0 ? newCost / newAmount : 0;
      position.amount = newAmount;
    } else {
      // 卖出减少持仓 / Selling decreases position
      // 计算已实现盈亏 / Calculate realized PnL
      const closedAmount = Math.min(Math.abs(position.amount), order.amount);
      if (position.amount > 0) {
        const pnl = closedAmount * (order.price - position.avgPrice);
        position.realizedPnL += pnl;

        // 记录交易 / Record trade
        this.state.trades.push({
          symbol: order.symbol,
          entryPrice: position.avgPrice,
          exitPrice: order.price,
          amount: closedAmount,
          pnl,
          timestamp: this.state.currentTime,
        });
      }
      position.amount -= order.amount;
    }
  }

  /**
   * 更新持仓盈亏
   * Update position PnL
   * @private
   */
  _updatePositionPnL(candle) {
    for (const [symbol, position] of this.state.positions) {
      if (position.amount !== 0) {
        // 计算未实现盈亏 / Calculate unrealized PnL
        position.unrealizedPnL = position.amount * (candle.close - position.avgPrice);
      }
    }
  }

  /**
   * 记录权益
   * Record equity
   * @private
   */
  _recordEquity(candle) {
    const equity = this.getEquity();
    this.state.equityCurve.push({
      timestamp: candle.timestamp,
      equity,
      capital: this.state.capital,
    });
  }

  /**
   * 平掉所有持仓
   * Close all positions
   * @private
   */
  async _closeAllPositions() {
    for (const [symbol, position] of this.state.positions) {
      if (position.amount !== 0) {
        this.closePosition(symbol);
      }
    }
  }

  /**
   * 计算统计数据
   * Calculate statistics
   * @private
   */
  _calculateStats() {
    // 基础数据 / Basic data
    const initialCapital = this.config.initialCapital;
    const finalEquity = this.getEquity();
    const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

    // 计算年化收益 / Calculate annualized return
    let annualReturn = 0;
    if (this.data && this.data.length >= 2) {
      const startTime = this.data[0].timestamp;
      const endTime = this.data[this.data.length - 1].timestamp;
      const days = (endTime - startTime) / (1000 * 60 * 60 * 24);
      if (days > 0) {
        // 年化收益率 = ((1 + 总收益率) ^ (365/天数) - 1) * 100
        const totalReturnDecimal = totalReturn / 100;
        annualReturn = (Math.pow(1 + totalReturnDecimal, 365 / days) - 1) * 100;
      }
    }

    // 交易统计 / Trade statistics
    const totalTrades = this.state.trades.length;
    const winningTrades = this.state.trades.filter(t => t.pnl > 0);
    const losingTrades = this.state.trades.filter(t => t.pnl < 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    // 盈亏统计 / PnL statistics
    const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    // 平均盈亏 / Average PnL
    const avgWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;

    // 最大回撤 / Maximum drawdown
    const { maxDrawdown, maxDrawdownPercent } = this._calculateMaxDrawdown();

    // 夏普比率 / Sharpe ratio
    const sharpeRatio = this._calculateSharpeRatio();

    // 构建统计结果 / Build statistics result
    return {
      // 账户统计 / Account statistics
      initialCapital,                    // 初始资金 / Initial capital
      finalEquity,                       // 最终权益 / Final equity
      totalReturn,                       // 总收益率 (%) / Total return (%)
      annualReturn,                      // 年化收益率 (%) / Annual return (%)
      totalReturnAmount: finalEquity - initialCapital,  // 总收益额 / Total return amount

      // 交易统计 / Trade statistics
      totalTrades,                       // 总交易次数 / Total trades
      winningTrades: winningTrades.length,   // 盈利次数 / Winning trades
      losingTrades: losingTrades.length,     // 亏损次数 / Losing trades
      winRate,                           // 胜率 (%) / Win rate (%)

      // 盈亏分析 / PnL analysis
      totalProfit,                       // 总盈利 / Total profit
      totalLoss,                         // 总亏损 / Total loss
      profitFactor,                      // 盈亏比 / Profit factor
      avgWin,                            // 平均盈利 / Average win
      avgLoss,                           // 平均亏损 / Average loss

      // 风险指标 / Risk metrics
      maxDrawdown,                       // 最大回撤 / Maximum drawdown
      maxDrawdownPercent,                // 最大回撤百分比 / Maximum drawdown percent
      sharpeRatio,                       // 夏普比率 / Sharpe ratio

      // 原始数据 / Raw data
      equityCurve: this.state.equityCurve,   // 权益曲线 / Equity curve
      trades: this.state.trades,         // 交易列表 / Trade list
      orders: this.state.orders,         // 订单列表 / Order list
    };
  }

  /**
   * 计算最大回撤
   * Calculate maximum drawdown
   * @private
   */
  _calculateMaxDrawdown() {
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const point of this.state.equityCurve) {
      // 更新峰值 / Update peak
      if (point.equity > peak) {
        peak = point.equity;
      }

      // 计算回撤 / Calculate drawdown
      const drawdown = peak - point.equity;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

      // 更新最大回撤 / Update maximum drawdown
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * 计算夏普比率
   * Calculate Sharpe ratio
   * @private
   */
  _calculateSharpeRatio() {
    // 如果权益曲线点数太少，返回 0 / If too few equity curve points, return 0
    if (this.state.equityCurve.length < 2) {
      return 0;
    }

    // 计算日收益率 / Calculate daily returns
    const returns = [];
    for (let i = 1; i < this.state.equityCurve.length; i++) {
      const prevEquity = this.state.equityCurve[i - 1].equity;
      const currEquity = this.state.equityCurve[i].equity;
      const returnRate = (currEquity - prevEquity) / prevEquity;
      returns.push(returnRate);
    }

    // 计算平均收益率 / Calculate average return
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // 计算标准差 / Calculate standard deviation
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // 计算夏普比率 (假设无风险利率为 0) / Calculate Sharpe ratio (assuming risk-free rate is 0)
    // 年化: 假设 252 个交易日 / Annualized: assuming 252 trading days
    const annualizedReturn = avgReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);

    return annualizedStdDev > 0 ? annualizedReturn / annualizedStdDev : 0;
  }
}

// 导出默认类 / Export default class
export default BacktestEngine;
