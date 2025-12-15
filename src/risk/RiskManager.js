/**
 * 风险管理器
 * Risk Manager
 *
 * 负责交易风险控制，包括仓位管理、止损止盈、每日亏损限制等
 * Responsible for trading risk control, including position sizing, stop loss/take profit, daily loss limits
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入高精度计算 / Import high precision calculation
import Decimal from 'decimal.js';

/**
 * 风险管理器类
 * Risk Manager Class
 */
export class RiskManager extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 风控配置 / Risk management configuration
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 风控配置 / Risk configuration
    this.config = {
      // 单笔最大亏损 (占总资金百分比) / Max loss per trade (percentage of total capital)
      maxLossPerTrade: config.maxLossPerTrade || 0.02,  // 2%

      // 单日最大亏损 (占总资金百分比) / Max daily loss (percentage of total capital)
      maxDailyLoss: config.maxDailyLoss || 0.05,  // 5%

      // 最大持仓数量 / Maximum number of positions
      maxPositions: config.maxPositions || 10,

      // 单个交易对最大仓位占比 / Max position size per symbol (percentage)
      maxPositionSize: config.maxPositionSize || 0.2,  // 20%

      // 最大杠杆倍数 / Maximum leverage
      maxLeverage: config.maxLeverage || 3,

      // 默认止损百分比 / Default stop loss percentage
      defaultStopLoss: config.defaultStopLoss || 0.05,  // 5%

      // 默认止盈百分比 / Default take profit percentage
      defaultTakeProfit: config.defaultTakeProfit || 0.1,  // 10%

      // 是否启用追踪止损 / Whether to enable trailing stop
      enableTrailingStop: config.enableTrailingStop || false,

      // 追踪止损距离 (百分比) / Trailing stop distance (percentage)
      trailingStopDistance: config.trailingStopDistance || 0.03,  // 3%

      // 冷却期 (毫秒) / Cooldown period (milliseconds)
      cooldownPeriod: config.cooldownPeriod || 60000,  // 1 分钟
    };

    // 风控状态 / Risk state
    this.state = {
      // 是否允许交易 / Whether trading is allowed
      tradingAllowed: true,

      // 今日已实现盈亏 / Today's realized PnL
      dailyPnL: 0,

      // 今日交易次数 / Today's trade count
      dailyTradeCount: 0,

      // 当前持仓数量 / Current position count
      currentPositions: 0,

      // 上次交易时间 / Last trade time
      lastTradeTime: 0,

      // 连续亏损次数 / Consecutive losses
      consecutiveLosses: 0,

      // 风控触发记录 / Risk trigger records
      triggers: [],
    };

    // 持仓监控 / Position monitoring
    this.positions = new Map();

    // 止损止盈订单 / Stop loss/take profit orders
    this.stopOrders = new Map();

    // 追踪止损状态 / Trailing stop state
    this.trailingStops = new Map();
  }

  /**
   * 检查是否允许开仓
   * Check if opening position is allowed
   * @param {Object} params - 检查参数 / Check parameters
   * @returns {Object} 检查结果 / Check result
   */
  checkOpenPosition(params) {
    const { symbol, side, amount, price, leverage = 1 } = params;

    // 结果对象 / Result object
    const result = {
      allowed: true,      // 是否允许 / Whether allowed
      reasons: [],        // 拒绝原因 / Rejection reasons
      adjustedAmount: amount,  // 调整后的数量 / Adjusted amount
    };

    // 检查交易是否被禁止 / Check if trading is disabled
    if (!this.state.tradingAllowed) {
      result.allowed = false;
      result.reasons.push('交易已被禁止 / Trading is disabled');
      return result;
    }

    // 检查冷却期 / Check cooldown period
    const timeSinceLastTrade = Date.now() - this.state.lastTradeTime;
    if (timeSinceLastTrade < this.config.cooldownPeriod) {
      result.allowed = false;
      result.reasons.push(`冷却期中，请等待 ${Math.ceil((this.config.cooldownPeriod - timeSinceLastTrade) / 1000)} 秒 / In cooldown, wait ${Math.ceil((this.config.cooldownPeriod - timeSinceLastTrade) / 1000)} seconds`);
      return result;
    }

    // 检查持仓数量限制 / Check position count limit
    if (this.state.currentPositions >= this.config.maxPositions) {
      result.allowed = false;
      result.reasons.push(`已达到最大持仓数量: ${this.config.maxPositions} / Max positions reached: ${this.config.maxPositions}`);
      return result;
    }

    // 检查杠杆限制 / Check leverage limit
    if (leverage > this.config.maxLeverage) {
      result.allowed = false;
      result.reasons.push(`杠杆超过限制: ${leverage} > ${this.config.maxLeverage} / Leverage exceeds limit: ${leverage} > ${this.config.maxLeverage}`);
      return result;
    }

    // 检查每日亏损限制 / Check daily loss limit
    if (this.state.dailyPnL < 0 && Math.abs(this.state.dailyPnL) >= this.config.maxDailyLoss) {
      result.allowed = false;
      result.reasons.push(`已达到每日最大亏损限制 / Daily loss limit reached`);
      this._triggerRisk('dailyLossLimit', '每日亏损限制 / Daily loss limit');
      return result;
    }

    // 检查连续亏损 / Check consecutive losses
    if (this.state.consecutiveLosses >= 5) {
      result.allowed = false;
      result.reasons.push(`连续亏损次数过多: ${this.state.consecutiveLosses} / Too many consecutive losses: ${this.state.consecutiveLosses}`);
      return result;
    }

    return result;
  }

  /**
   * 计算仓位大小
   * Calculate position size
   * @param {Object} params - 计算参数 / Calculation parameters
   * @returns {Object} 仓位信息 / Position info
   */
  calculatePositionSize(params) {
    const {
      capital,          // 可用资金 / Available capital
      price,            // 当前价格 / Current price
      stopLossPrice,    // 止损价格 / Stop loss price
      riskPercent,      // 风险百分比 (可选) / Risk percentage (optional)
    } = params;

    // 使用的风险百分比 / Risk percentage to use
    const risk = riskPercent || this.config.maxLossPerTrade;

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(risk);

    // 计算止损距离 / Calculate stop loss distance
    const stopDistance = stopLossPrice
      ? Math.abs(price - stopLossPrice)
      : price * this.config.defaultStopLoss;

    // 计算仓位大小 / Calculate position size
    // 仓位 = 风险金额 / 止损距离
    const positionSize = riskAmount.div(stopDistance).toNumber();

    // 计算仓位价值 / Calculate position value
    const positionValue = positionSize * price;

    // 检查是否超过最大仓位占比 / Check if exceeds max position size
    const maxPositionValue = capital * this.config.maxPositionSize;
    const adjustedSize = positionValue > maxPositionValue
      ? maxPositionValue / price
      : positionSize;

    return {
      size: adjustedSize,              // 建议仓位大小 / Recommended position size
      value: adjustedSize * price,     // 仓位价值 / Position value
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
      stopLossDistance: stopDistance,  // 止损距离 / Stop loss distance
      wasAdjusted: positionValue > maxPositionValue,  // 是否被调整 / Whether adjusted
    };
  }

  /**
   * 注册持仓
   * Register position
   * @param {Object} position - 持仓信息 / Position info
   */
  registerPosition(position) {
    const { symbol, side, amount, entryPrice, stopLoss, takeProfit } = position;

    // 创建持仓记录 / Create position record
    const positionRecord = {
      symbol,
      side,
      amount,
      entryPrice,
      stopLoss: stopLoss || this._calculateStopLoss(entryPrice, side),
      takeProfit: takeProfit || this._calculateTakeProfit(entryPrice, side),
      highestPrice: entryPrice,   // 最高价 (用于追踪止损) / Highest price (for trailing stop)
      lowestPrice: entryPrice,    // 最低价 (用于追踪止损) / Lowest price (for trailing stop)
      openTime: Date.now(),
      unrealizedPnL: 0,
    };

    // 保存持仓 / Save position
    this.positions.set(symbol, positionRecord);

    // 更新状态 / Update state
    this.state.currentPositions++;
    this.state.lastTradeTime = Date.now();
    this.state.dailyTradeCount++;

    // 发出事件 / Emit event
    this.emit('positionRegistered', positionRecord);

    console.log(`[RiskManager] 已注册持仓 / Position registered: ${symbol} ${side} ${amount} @ ${entryPrice}`);

    return positionRecord;
  }

  /**
   * 更新持仓价格
   * Update position price
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {Object|null} 触发的止损止盈信息 / Triggered stop loss/take profit info
   */
  updatePrice(symbol, currentPrice) {
    // 获取持仓 / Get position
    const position = this.positions.get(symbol);
    if (!position) {
      return null;
    }

    // 更新最高/最低价 / Update highest/lowest price
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
    }
    if (currentPrice < position.lowestPrice) {
      position.lowestPrice = currentPrice;
    }

    // 计算未实现盈亏 / Calculate unrealized PnL
    if (position.side === 'long') {
      position.unrealizedPnL = (currentPrice - position.entryPrice) * position.amount;
    } else {
      position.unrealizedPnL = (position.entryPrice - currentPrice) * position.amount;
    }

    // 更新追踪止损 / Update trailing stop
    if (this.config.enableTrailingStop) {
      this._updateTrailingStop(position, currentPrice);
    }

    // 检查止损 / Check stop loss
    if (this._checkStopLoss(position, currentPrice)) {
      return {
        type: 'stopLoss',
        symbol,
        price: currentPrice,
        position,
      };
    }

    // 检查止盈 / Check take profit
    if (this._checkTakeProfit(position, currentPrice)) {
      return {
        type: 'takeProfit',
        symbol,
        price: currentPrice,
        position,
      };
    }

    return null;
  }

  /**
   * 关闭持仓
   * Close position
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} exitPrice - 平仓价格 / Exit price
   * @param {string} reason - 平仓原因 / Close reason
   */
  closePosition(symbol, exitPrice, reason = '') {
    // 获取持仓 / Get position
    const position = this.positions.get(symbol);
    if (!position) {
      return null;
    }

    // 计算实现盈亏 / Calculate realized PnL
    let realizedPnL;
    if (position.side === 'long') {
      realizedPnL = (exitPrice - position.entryPrice) * position.amount;
    } else {
      realizedPnL = (position.entryPrice - exitPrice) * position.amount;
    }

    // 更新状态 / Update state
    this.state.dailyPnL += realizedPnL;
    this.state.currentPositions--;

    // 更新连续亏损 / Update consecutive losses
    if (realizedPnL < 0) {
      this.state.consecutiveLosses++;
    } else {
      this.state.consecutiveLosses = 0;
    }

    // 创建平仓记录 / Create close record
    const closeRecord = {
      symbol,
      entryPrice: position.entryPrice,
      exitPrice,
      amount: position.amount,
      side: position.side,
      realizedPnL,
      holdingTime: Date.now() - position.openTime,
      reason,
    };

    // 移除持仓 / Remove position
    this.positions.delete(symbol);
    this.trailingStops.delete(symbol);

    // 发出事件 / Emit event
    this.emit('positionClosed', closeRecord);

    console.log(`[RiskManager] 持仓已关闭 / Position closed: ${symbol} PnL: ${realizedPnL.toFixed(2)} Reason: ${reason}`);

    // 检查是否需要禁止交易 / Check if trading should be disabled
    this._checkDailyLossLimit();

    return closeRecord;
  }

  /**
   * 重置每日统计
   * Reset daily statistics
   */
  resetDaily() {
    this.state.dailyPnL = 0;
    this.state.dailyTradeCount = 0;
    this.state.consecutiveLosses = 0;
    this.state.tradingAllowed = true;
    this.state.triggers = [];

    console.log('[RiskManager] 每日统计已重置 / Daily statistics reset');
    this.emit('dailyReset');
  }

  /**
   * 禁止交易
   * Disable trading
   * @param {string} reason - 原因 / Reason
   */
  disableTrading(reason = '') {
    this.state.tradingAllowed = false;
    console.log(`[RiskManager] 交易已禁止 / Trading disabled: ${reason}`);
    this.emit('tradingDisabled', { reason });
  }

  /**
   * 恢复交易
   * Enable trading
   */
  enableTrading() {
    this.state.tradingAllowed = true;
    console.log('[RiskManager] 交易已恢复 / Trading enabled');
    this.emit('tradingEnabled');
  }

  /**
   * 获取风控状态
   * Get risk status
   * @returns {Object} 风控状态 / Risk status
   */
  getStatus() {
    return {
      ...this.state,
      positions: Array.from(this.positions.values()),
      config: this.config,
    };
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 计算止损价格
   * Calculate stop loss price
   * @private
   */
  _calculateStopLoss(entryPrice, side) {
    if (side === 'long') {
      return entryPrice * (1 - this.config.defaultStopLoss);
    } else {
      return entryPrice * (1 + this.config.defaultStopLoss);
    }
  }

  /**
   * 计算止盈价格
   * Calculate take profit price
   * @private
   */
  _calculateTakeProfit(entryPrice, side) {
    if (side === 'long') {
      return entryPrice * (1 + this.config.defaultTakeProfit);
    } else {
      return entryPrice * (1 - this.config.defaultTakeProfit);
    }
  }

  /**
   * 检查止损
   * Check stop loss
   * @private
   */
  _checkStopLoss(position, currentPrice) {
    if (position.side === 'long') {
      return currentPrice <= position.stopLoss;
    } else {
      return currentPrice >= position.stopLoss;
    }
  }

  /**
   * 检查止盈
   * Check take profit
   * @private
   */
  _checkTakeProfit(position, currentPrice) {
    if (position.side === 'long') {
      return currentPrice >= position.takeProfit;
    } else {
      return currentPrice <= position.takeProfit;
    }
  }

  /**
   * 更新追踪止损
   * Update trailing stop
   * @private
   */
  _updateTrailingStop(position, currentPrice) {
    const trailingDistance = position.entryPrice * this.config.trailingStopDistance;

    if (position.side === 'long') {
      // 多头：价格上涨时，止损跟随上移 / Long: stop loss follows up when price rises
      const newStopLoss = position.highestPrice - trailingDistance;
      if (newStopLoss > position.stopLoss) {
        position.stopLoss = newStopLoss;
        this.emit('trailingStopUpdated', { symbol: position.symbol, newStopLoss });
      }
    } else {
      // 空头：价格下跌时，止损跟随下移 / Short: stop loss follows down when price falls
      const newStopLoss = position.lowestPrice + trailingDistance;
      if (newStopLoss < position.stopLoss) {
        position.stopLoss = newStopLoss;
        this.emit('trailingStopUpdated', { symbol: position.symbol, newStopLoss });
      }
    }
  }

  /**
   * 检查每日亏损限制
   * Check daily loss limit
   * @private
   */
  _checkDailyLossLimit() {
    if (this.state.dailyPnL < 0 && Math.abs(this.state.dailyPnL) >= this.config.maxDailyLoss) {
      this.disableTrading('每日亏损限制已达到 / Daily loss limit reached');
    }
  }

  /**
   * 触发风控
   * Trigger risk control
   * @private
   */
  _triggerRisk(type, message) {
    const trigger = {
      type,
      message,
      timestamp: Date.now(),
    };

    this.state.triggers.push(trigger);
    this.emit('riskTriggered', trigger);

    console.warn(`[RiskManager] 风控触发 / Risk triggered: ${type} - ${message}`);
  }
}

// 导出默认类 / Export default class
export default RiskManager;
