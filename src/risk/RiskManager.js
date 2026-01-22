/**
 * 风险管理器
 * Risk Manager
 *
 * 负责交易风险控制，包括仓位管理、止损止盈、每日亏损限制等
 * Responsible for trading risk control, including position sizing, stop loss/take profit, daily loss limits
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入高精度计算 / Import high precision calculation
import Decimal from 'decimal.js'; // 导入模块 decimal.js

/**
 * 风险管理器类
 * Risk Manager Class
 */
export class RiskManager extends EventEmitter { // 导出类 RiskManager
  /**
   * 构造函数
   * @param {Object} config - 风控配置 / Risk management configuration
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 风控配置 / Risk configuration
    this.config = { // 设置 config
      // 单笔最大亏损 (占总资金百分比) / Max loss per trade (percentage of total capital)
      maxLossPerTrade: config.maxLossPerTrade || 0.02,  // 2%

      // 单日最大亏损 (占总资金百分比) / Max daily loss (percentage of total capital)
      maxDailyLoss: config.maxDailyLoss || 0.05,  // 5%

      // 最大持仓数量 / Maximum number of positions
      maxPositions: config.maxPositions || 10, // 设置 maxPositions 字段

      // 单个交易对最大仓位占比 / Max position size per symbol (percentage)
      maxPositionSize: config.maxPositionSize || 0.2,  // 20%

      // 最大杠杆倍数 / Maximum leverage
      maxLeverage: config.maxLeverage || 3, // 设置 maxLeverage 字段

      // 默认止损百分比 / Default stop loss percentage
      defaultStopLoss: config.defaultStopLoss || 0.05,  // 5%

      // 默认止盈百分比 / Default take profit percentage
      defaultTakeProfit: config.defaultTakeProfit || 0.1,  // 10%

      // 是否启用追踪止损 / Whether to enable trailing stop
      enableTrailingStop: config.enableTrailingStop || false, // 设置 enableTrailingStop 字段

      // 追踪止损距离 (百分比) / Trailing stop distance (percentage)
      trailingStopDistance: config.trailingStopDistance || 0.03,  // 3%

      // 冷却期 (毫秒) / Cooldown period (milliseconds)
      cooldownPeriod: config.cooldownPeriod || 60000,  // 1 分钟
    }; // 结束代码块

    // 风控状态 / Risk state
    this.state = { // 设置 state
      // 是否允许交易 / Whether trading is allowed
      tradingAllowed: true, // 设置 tradingAllowed 字段

      // 今日已实现盈亏 / Today's realized PnL
      dailyPnL: 0, // 设置 dailyPnL 字段

      // 今日交易次数 / Today's trade count
      dailyTradeCount: 0, // 设置 dailyTradeCount 字段

      // 当前持仓数量 / Current position count
      currentPositions: 0, // 设置 currentPositions 字段

      // 上次交易时间 / Last trade time
      lastTradeTime: 0, // 设置 lastTradeTime 字段

      // 连续亏损次数 / Consecutive losses
      consecutiveLosses: 0, // 设置 consecutiveLosses 字段

      // 风控触发记录 / Risk trigger records
      triggers: [], // 设置 triggers 字段
    }; // 结束代码块

    // 持仓监控 / Position monitoring
    this.positions = new Map(); // 设置 positions

    // 止损止盈订单 / Stop loss/take profit orders
    this.stopOrders = new Map(); // 设置 stopOrders

    // 追踪止损状态 / Trailing stop state
    this.trailingStops = new Map(); // 设置 trailingStops
  } // 结束代码块

  /**
   * 检查是否允许开仓
   * Check if opening position is allowed
   * @param {Object} params - 检查参数 / Check parameters
   * @returns {Object} 检查结果 / Check result
   */
  checkOpenPosition(params) { // 调用 checkOpenPosition
    const { symbol, side, amount, price, leverage = 1 } = params; // 解构赋值

    // 结果对象 / Result object
    const result = { // 定义常量 result
      allowed: true,      // 是否允许 / Whether allowed
      reasons: [],        // 拒绝原因 / Rejection reasons
      adjustedAmount: amount,  // 调整后的数量 / Adjusted amount
    }; // 结束代码块

    // 检查交易是否被禁止 / Check if trading is disabled
    if (!this.state.tradingAllowed) { // 条件判断 !this.state.tradingAllowed
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push('交易已被禁止 / Trading is disabled'); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查冷却期 / Check cooldown period
    const timeSinceLastTrade = Date.now() - this.state.lastTradeTime; // 定义常量 timeSinceLastTrade
    if (timeSinceLastTrade < this.config.cooldownPeriod) { // 条件判断 timeSinceLastTrade < this.config.cooldownPeriod
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`冷却期中，请等待 ${Math.ceil((this.config.cooldownPeriod - timeSinceLastTrade) / 1000)} 秒 / In cooldown, wait ${Math.ceil((this.config.cooldownPeriod - timeSinceLastTrade) / 1000)} seconds`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查持仓数量限制 / Check position count limit
    if (this.state.currentPositions >= this.config.maxPositions) { // 条件判断 this.state.currentPositions >= this.config.ma...
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`已达到最大持仓数量: ${this.config.maxPositions} / Max positions reached: ${this.config.maxPositions}`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查杠杆限制 / Check leverage limit
    if (leverage > this.config.maxLeverage) { // 条件判断 leverage > this.config.maxLeverage
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`杠杆超过限制: ${leverage} > ${this.config.maxLeverage} / Leverage exceeds limit: ${leverage} > ${this.config.maxLeverage}`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查每日亏损限制 / Check daily loss limit
    if (this.state.dailyPnL < 0 && Math.abs(this.state.dailyPnL) >= this.config.maxDailyLoss) { // 条件判断 this.state.dailyPnL < 0 && Math.abs(this.stat...
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`已达到每日最大亏损限制 / Daily loss limit reached`); // 调用 result.reasons.push
      this._triggerRisk('dailyLossLimit', '每日亏损限制 / Daily loss limit'); // 调用 _triggerRisk
      return result; // 返回结果
    } // 结束代码块

    // 检查连续亏损 / Check consecutive losses
    if (this.state.consecutiveLosses >= 5) { // 条件判断 this.state.consecutiveLosses >= 5
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`连续亏损次数过多: ${this.state.consecutiveLosses} / Too many consecutive losses: ${this.state.consecutiveLosses}`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算仓位大小
   * Calculate position size
   * @param {Object} params - 计算参数 / Calculation parameters
   * @returns {Object} 仓位信息 / Position info
   */
  calculatePositionSize(params) { // 调用 calculatePositionSize
    const { // 解构赋值
      capital,          // 可用资金 / Available capital
      price,            // 当前价格 / Current price
      stopLossPrice,    // 止损价格 / Stop loss price
      riskPercent,      // 风险百分比 (可选) / Risk percentage (optional)
    } = params; // 执行语句

    // 使用的风险百分比 / Risk percentage to use
    const risk = riskPercent || this.config.maxLossPerTrade; // 定义常量 risk

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(risk); // 定义常量 riskAmount

    // 计算止损距离 / Calculate stop loss distance
    const stopDistance = stopLossPrice // 定义常量 stopDistance
      ? Math.abs(price - stopLossPrice) // 执行语句
      : price * this.config.defaultStopLoss; // 执行语句

    // 计算仓位大小 / Calculate position size
    // 仓位 = 风险金额 / 止损距离
    const positionSize = riskAmount.div(stopDistance).toNumber(); // 定义常量 positionSize

    // 计算仓位价值 / Calculate position value
    const positionValue = positionSize * price; // 定义常量 positionValue

    // 检查是否超过最大仓位占比 / Check if exceeds max position size
    const maxPositionValue = capital * this.config.maxPositionSize; // 定义常量 maxPositionValue
    const adjustedSize = positionValue > maxPositionValue // 定义常量 adjustedSize
      ? maxPositionValue / price // 执行语句
      : positionSize; // 执行语句

    return { // 返回结果
      size: adjustedSize,              // 建议仓位大小 / Recommended position size
      value: adjustedSize * price,     // 仓位价值 / Position value
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
      stopLossDistance: stopDistance,  // 止损距离 / Stop loss distance
      wasAdjusted: positionValue > maxPositionValue,  // 是否被调整 / Whether adjusted
    }; // 结束代码块
  } // 结束代码块

  /**
   * 注册持仓
   * Register position
   * @param {Object} position - 持仓信息 / Position info
   */
  registerPosition(position) { // 调用 registerPosition
    const { symbol, side, amount, entryPrice, stopLoss, takeProfit } = position; // 解构赋值

    // 创建持仓记录 / Create position record
    const positionRecord = { // 定义常量 positionRecord
      symbol, // 执行语句
      side, // 执行语句
      amount, // 执行语句
      entryPrice, // 执行语句
      stopLoss: stopLoss || this._calculateStopLoss(entryPrice, side), // 设置 stopLoss 字段
      takeProfit: takeProfit || this._calculateTakeProfit(entryPrice, side), // 设置 takeProfit 字段
      highestPrice: entryPrice,   // 最高价 (用于追踪止损) / Highest price (for trailing stop)
      lowestPrice: entryPrice,    // 最低价 (用于追踪止损) / Lowest price (for trailing stop)
      openTime: Date.now(), // 设置 openTime 字段
      unrealizedPnL: 0, // 设置 unrealizedPnL 字段
    }; // 结束代码块

    // 保存持仓 / Save position
    this.positions.set(symbol, positionRecord); // 访问 positions

    // 更新状态 / Update state
    this.state.currentPositions++; // 访问 state
    this.state.lastTradeTime = Date.now(); // 访问 state
    this.state.dailyTradeCount++; // 访问 state

    // 发出事件 / Emit event
    this.emit('positionRegistered', positionRecord); // 调用 emit

    console.log(`[RiskManager] 已注册持仓 / Position registered: ${symbol} ${side} ${amount} @ ${entryPrice}`); // 控制台输出

    return positionRecord; // 返回结果
  } // 结束代码块

  /**
   * 更新持仓价格
   * Update position price
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {Object|null} 触发的止损止盈信息 / Triggered stop loss/take profit info
   */
  updatePrice(symbol, currentPrice) { // 调用 updatePrice
    // 获取持仓 / Get position
    const position = this.positions.get(symbol); // 定义常量 position
    if (!position) { // 条件判断 !position
      return null; // 返回结果
    } // 结束代码块

    // 更新最高/最低价 / Update highest/lowest price
    if (currentPrice > position.highestPrice) { // 条件判断 currentPrice > position.highestPrice
      position.highestPrice = currentPrice; // 赋值 position.highestPrice
    } // 结束代码块
    if (currentPrice < position.lowestPrice) { // 条件判断 currentPrice < position.lowestPrice
      position.lowestPrice = currentPrice; // 赋值 position.lowestPrice
    } // 结束代码块

    // 计算未实现盈亏 / Calculate unrealized PnL
    if (position.side === 'long') { // 条件判断 position.side === 'long'
      position.unrealizedPnL = (currentPrice - position.entryPrice) * position.amount; // 赋值 position.unrealizedPnL
    } else { // 执行语句
      position.unrealizedPnL = (position.entryPrice - currentPrice) * position.amount; // 赋值 position.unrealizedPnL
    } // 结束代码块

    // 更新追踪止损 / Update trailing stop
    if (this.config.enableTrailingStop) { // 条件判断 this.config.enableTrailingStop
      this._updateTrailingStop(position, currentPrice); // 调用 _updateTrailingStop
    } // 结束代码块

    // 检查止损 / Check stop loss
    if (this._checkStopLoss(position, currentPrice)) { // 条件判断 this._checkStopLoss(position, currentPrice)
      return { // 返回结果
        type: 'stopLoss', // 设置 type 字段
        symbol, // 执行语句
        price: currentPrice, // 设置 price 字段
        position, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    // 检查止盈 / Check take profit
    if (this._checkTakeProfit(position, currentPrice)) { // 条件判断 this._checkTakeProfit(position, currentPrice)
      return { // 返回结果
        type: 'takeProfit', // 设置 type 字段
        symbol, // 执行语句
        price: currentPrice, // 设置 price 字段
        position, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 关闭持仓
   * Close position
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} exitPrice - 平仓价格 / Exit price
   * @param {string} reason - 平仓原因 / Close reason
   */
  closePosition(symbol, exitPrice, reason = '') { // 调用 closePosition
    // 获取持仓 / Get position
    const position = this.positions.get(symbol); // 定义常量 position
    if (!position) { // 条件判断 !position
      return null; // 返回结果
    } // 结束代码块

    // 计算实现盈亏 / Calculate realized PnL
    let realizedPnL; // 定义变量 realizedPnL
    if (position.side === 'long') { // 条件判断 position.side === 'long'
      realizedPnL = (exitPrice - position.entryPrice) * position.amount; // 赋值 realizedPnL
    } else { // 执行语句
      realizedPnL = (position.entryPrice - exitPrice) * position.amount; // 赋值 realizedPnL
    } // 结束代码块

    // 更新状态 / Update state
    this.state.dailyPnL += realizedPnL; // 访问 state
    this.state.currentPositions--; // 访问 state

    // 更新连续亏损 / Update consecutive losses
    if (realizedPnL < 0) { // 条件判断 realizedPnL < 0
      this.state.consecutiveLosses++; // 访问 state
    } else { // 执行语句
      this.state.consecutiveLosses = 0; // 访问 state
    } // 结束代码块

    // 创建平仓记录 / Create close record
    const closeRecord = { // 定义常量 closeRecord
      symbol, // 执行语句
      entryPrice: position.entryPrice, // 设置 entryPrice 字段
      exitPrice, // 执行语句
      amount: position.amount, // 设置 amount 字段
      side: position.side, // 设置 side 字段
      realizedPnL, // 执行语句
      holdingTime: Date.now() - position.openTime, // 设置 holdingTime 字段
      reason, // 执行语句
    }; // 结束代码块

    // 移除持仓 / Remove position
    this.positions.delete(symbol); // 访问 positions
    this.trailingStops.delete(symbol); // 访问 trailingStops

    // 发出事件 / Emit event
    this.emit('positionClosed', closeRecord); // 调用 emit

    console.log(`[RiskManager] 持仓已关闭 / Position closed: ${symbol} PnL: ${realizedPnL.toFixed(2)} Reason: ${reason}`); // 控制台输出

    // 检查是否需要禁止交易 / Check if trading should be disabled
    this._checkDailyLossLimit(); // 调用 _checkDailyLossLimit

    return closeRecord; // 返回结果
  } // 结束代码块

  /**
   * 重置每日统计
   * Reset daily statistics
   */
  resetDaily() { // 调用 resetDaily
    this.state.dailyPnL = 0; // 访问 state
    this.state.dailyTradeCount = 0; // 访问 state
    this.state.consecutiveLosses = 0; // 访问 state
    this.state.tradingAllowed = true; // 访问 state
    this.state.triggers = []; // 访问 state

    console.log('[RiskManager] 每日统计已重置 / Daily statistics reset'); // 控制台输出
    this.emit('dailyReset'); // 调用 emit
  } // 结束代码块

  /**
   * 禁止交易
   * Disable trading
   * @param {string} reason - 原因 / Reason
   */
  disableTrading(reason = '') { // 调用 disableTrading
    this.state.tradingAllowed = false; // 访问 state
    console.log(`[RiskManager] 交易已禁止 / Trading disabled: ${reason}`); // 控制台输出
    this.emit('tradingDisabled', { reason }); // 调用 emit
  } // 结束代码块

  /**
   * 恢复交易
   * Enable trading
   */
  enableTrading() { // 调用 enableTrading
    this.state.tradingAllowed = true; // 访问 state
    console.log('[RiskManager] 交易已恢复 / Trading enabled'); // 控制台输出
    this.emit('tradingEnabled'); // 调用 emit
  } // 结束代码块

  /**
   * 获取风控状态
   * Get risk status
   * @returns {Object} 风控状态 / Risk status
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      ...this.state, // 展开对象或数组
      positions: Array.from(this.positions.values()), // 设置 positions 字段
      config: this.config, // 设置 config 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 计算止损价格
   * Calculate stop loss price
   * @private
   */
  _calculateStopLoss(entryPrice, side) { // 调用 _calculateStopLoss
    if (side === 'long') { // 条件判断 side === 'long'
      return entryPrice * (1 - this.config.defaultStopLoss); // 返回结果
    } else { // 执行语句
      return entryPrice * (1 + this.config.defaultStopLoss); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算止盈价格
   * Calculate take profit price
   * @private
   */
  _calculateTakeProfit(entryPrice, side) { // 调用 _calculateTakeProfit
    if (side === 'long') { // 条件判断 side === 'long'
      return entryPrice * (1 + this.config.defaultTakeProfit); // 返回结果
    } else { // 执行语句
      return entryPrice * (1 - this.config.defaultTakeProfit); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查止损
   * Check stop loss
   * @private
   */
  _checkStopLoss(position, currentPrice) { // 调用 _checkStopLoss
    if (position.side === 'long') { // 条件判断 position.side === 'long'
      return currentPrice <= position.stopLoss; // 返回结果
    } else { // 执行语句
      return currentPrice >= position.stopLoss; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查止盈
   * Check take profit
   * @private
   */
  _checkTakeProfit(position, currentPrice) { // 调用 _checkTakeProfit
    if (position.side === 'long') { // 条件判断 position.side === 'long'
      return currentPrice >= position.takeProfit; // 返回结果
    } else { // 执行语句
      return currentPrice <= position.takeProfit; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新追踪止损
   * Update trailing stop
   * @private
   */
  _updateTrailingStop(position, currentPrice) { // 调用 _updateTrailingStop
    const trailingDistance = position.entryPrice * this.config.trailingStopDistance; // 定义常量 trailingDistance

    if (position.side === 'long') { // 条件判断 position.side === 'long'
      // 多头：价格上涨时，止损跟随上移 / Long: stop loss follows up when price rises
      const newStopLoss = position.highestPrice - trailingDistance; // 定义常量 newStopLoss
      if (newStopLoss > position.stopLoss) { // 条件判断 newStopLoss > position.stopLoss
        position.stopLoss = newStopLoss; // 赋值 position.stopLoss
        this.emit('trailingStopUpdated', { symbol: position.symbol, newStopLoss }); // 调用 emit
      } // 结束代码块
    } else { // 执行语句
      // 空头：价格下跌时，止损跟随下移 / Short: stop loss follows down when price falls
      const newStopLoss = position.lowestPrice + trailingDistance; // 定义常量 newStopLoss
      if (newStopLoss < position.stopLoss) { // 条件判断 newStopLoss < position.stopLoss
        position.stopLoss = newStopLoss; // 赋值 position.stopLoss
        this.emit('trailingStopUpdated', { symbol: position.symbol, newStopLoss }); // 调用 emit
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查每日亏损限制
   * Check daily loss limit
   * @private
   */
  _checkDailyLossLimit() { // 调用 _checkDailyLossLimit
    if (this.state.dailyPnL < 0 && Math.abs(this.state.dailyPnL) >= this.config.maxDailyLoss) { // 条件判断 this.state.dailyPnL < 0 && Math.abs(this.stat...
      this.disableTrading('每日亏损限制已达到 / Daily loss limit reached'); // 调用 disableTrading
    } // 结束代码块
  } // 结束代码块

  /**
   * 触发风控
   * Trigger risk control
   * @private
   */
  _triggerRisk(type, message) { // 调用 _triggerRisk
    const trigger = { // 定义常量 trigger
      type, // 执行语句
      message, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    this.state.triggers.push(trigger); // 访问 state
    this.emit('riskTriggered', trigger); // 调用 emit

    console.warn(`[RiskManager] 风控触发 / Risk triggered: ${type} - ${message}`); // 控制台输出
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default RiskManager; // 默认导出
