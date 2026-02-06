/**
 * 网格交易策略
 * Grid Trading Strategy
 *
 * 在价格区间内设置多个买卖网格，实现自动低买高卖
 * Sets multiple buy/sell grids within a price range for automatic buy low sell high
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

/**
 * 网格策略类
 * Grid Strategy Class
 */
export class GridStrategy extends BaseStrategy { // 导出类 GridStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super({ // 调用父类
      name: 'GridStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // 网格宽度百分比 (基于当前价格) / Grid width percentage (based on current price)
    // 例如 0.1 表示上下各 5%，总范围 10%
    // e.g., 0.1 means 5% above and below, 10% total range
    this.gridWidthPercent = params.gridWidthPercent || 0.1; // 设置 gridWidthPercent

    // 网格上限价格 (将在 onInit 中动态设置) / Grid upper price (will be set dynamically in onInit)
    this.upperPrice = params.upperPrice || null; // 设置 upperPrice

    // 网格下限价格 (将在 onInit 中动态设置) / Grid lower price (will be set dynamically in onInit)
    this.lowerPrice = params.lowerPrice || null; // 设置 lowerPrice

    // 是否使用动态价格初始化 / Whether to use dynamic price initialization
    this.useDynamicPrice = params.useDynamicPrice !== false; // 设置 useDynamicPrice

    const resolveNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback); // 解析数值参数

    // 价格长期超出区间时自动调整网格 / Auto adjust grid when price stays out of range
    this.autoRecenter = params.autoRecenter !== undefined ? Boolean(params.autoRecenter) : this.useDynamicPrice; // 设置 autoRecenter
    this.outOfRangeAction = params.outOfRangeAction || 'recenter'; // outOfRangeAction: recenter | expand
    this.outOfRangeRecenterTicks = resolveNumber(params.outOfRangeRecenterTicks, 0); // 连续超出多少 tick 触发
    this.outOfRangeRecenterMs = resolveNumber(params.outOfRangeRecenterMs, 30 * 60 * 1000); // 超出持续时间触发 (ms)
    this.minRecenterIntervalMs = resolveNumber(params.minRecenterIntervalMs, 10 * 60 * 1000); // 最小重置间隔
    this.recenterWidthMultiplier = resolveNumber(params.recenterWidthMultiplier, 1.0); // 重置时宽度倍数
    this.expandBufferPercent = resolveNumber(params.expandBufferPercent, 0.05); // 扩网缓冲比例
    this.allowRecenterWithPosition = params.allowRecenterWithPosition === true; // 是否允许有持仓时调整

    // 网格数量 / Number of grids
    this.gridCount = params.gridCount || 10; // 设置 gridCount

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 每格投资金额 / Investment per grid
    this.amountPerGrid = params.amountPerGrid || 100; // 设置 amountPerGrid

    // 网格数组 / Grid array
    this.grids = []; // 设置 grids

    // 已触发的网格 / Triggered grids
    this.triggeredGrids = new Map(); // 设置 triggeredGrids

    // 网格是否已初始化 / Whether grids are initialized
    this._gridsInitialized = false; // 设置 _gridsInitialized

    // 超出区间跟踪 / Out-of-range tracking
    this._outOfRangeStreak = 0; // 连续超出次数
    this._outOfRangeStartTs = null; // 超出开始时间
    this._lastRecenterAt = 0; // 上次自动调整时间
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 网格策略需要实时价格 / Grid strategy needs real-time ticker
    return ['ticker']; // 返回结果
  } // 结束代码块

  /**
   * 初始化网格
   * Initialize grids
   * @private
   */
  _initializeGrids() { // 调用 _initializeGrids
    // 清空现有网格 / Clear existing grids
    this.grids = []; // 设置 grids

    // 计算网格间距 / Calculate grid spacing
    const gridSpacing = (this.upperPrice - this.lowerPrice) / this.gridCount; // 定义常量 gridSpacing

    // 创建网格 / Create grids
    for (let i = 0; i <= this.gridCount; i++) { // 循环 let i = 0; i <= this.gridCount; i++
      const price = this.lowerPrice + i * gridSpacing; // 定义常量 price
      this.grids.push({ // 访问 grids
        id: i,                      // 网格 ID / Grid ID
        price,                      // 网格价格 / Grid price
        buyTriggered: false,        // 是否已触发买入 / Buy triggered
        sellTriggered: false,       // 是否已触发卖出 / Sell triggered
        position: 0,                // 该网格持仓 / Grid position
      }); // 结束代码块
    } // 结束代码块

    // 标记网格已初始化 / Mark grids as initialized
    this._gridsInitialized = true; // 设置 _gridsInitialized
  } // 结束代码块

  /**
   * 初始化
   * Initialization
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    // 如果手动设置了上下限，直接初始化网格
    // If upper/lower limits are manually set, initialize grids directly
    if (!this.useDynamicPrice && this.upperPrice !== null && this.lowerPrice !== null) { // 条件判断 !this.useDynamicPrice && this.upperPrice !== ...
      this._initializeGrids(); // 调用 _initializeGrids
      this._logGridInfo(); // 调用 _logGridInfo
    } // 结束代码块
    // 否则延迟到 initCandleHistory 或 onTick 时初始化
    // Otherwise delay initialization to initCandleHistory or onTick
  } // 结束代码块

  /**
   * 初始化 K 线历史数据后回调 - 用于动态初始化网格
   * Callback after candle history is initialized - for dynamic grid initialization
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} candles - 历史 K 线数据 / Historical candle data
   */
  initCandleHistory(symbol, candles) { // 调用 initCandleHistory
    // 调用父类方法 / Call parent method
    super.initCandleHistory(symbol, candles); // 调用父类

    // 如果网格未初始化且使用动态价格，尝试从历史数据初始化
    // If grids not initialized and using dynamic price, try to initialize from history
    if (!this._gridsInitialized && this.useDynamicPrice) { // 条件判断 !this._gridsInitialized && this.useDynamicPrice
      this._initializeGridsFromHistory(); // 调用 _initializeGridsFromHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 从历史数据初始化网格
   * Initialize grids from historical data
   * @private
   */
  _initializeGridsFromHistory() { // 调用 _initializeGridsFromHistory
    if (this._candleHistory && this._candleHistory.length > 0) { // 条件判断 this._candleHistory && this._candleHistory.le...
      const lastCandle = this._candleHistory[this._candleHistory.length - 1]; // 定义常量 lastCandle
      const currentPrice = lastCandle.close; // 定义常量 currentPrice

      // 基于当前价格和百分比计算网格范围
      // Calculate grid range based on current price and percentage
      const halfWidth = currentPrice * (this.gridWidthPercent / 2); // 定义常量 halfWidth
      this.upperPrice = Math.round(currentPrice + halfWidth); // 设置 upperPrice
      this.lowerPrice = Math.round(currentPrice - halfWidth); // 设置 lowerPrice

      this.log(`从历史数据初始化网格 / Initializing grid from history: 当前价格=${currentPrice}`); // 调用 log
      this._initializeGrids(); // 调用 _initializeGrids
      this._logGridInfo(); // 调用 _logGridInfo
    } // 结束代码块
  } // 结束代码块

  /**
   * 输出网格信息日志
   * Log grid information
   * @private
   */
  _logGridInfo() { // 调用 _logGridInfo
    this.log(`网格范围 / Grid Range: ${this.lowerPrice} - ${this.upperPrice}`); // 调用 log
    this.log(`网格数量 / Grid Count: ${this.gridCount}`); // 调用 log
    this.log(`网格间距 / Grid Spacing: ${((this.upperPrice - this.lowerPrice) / this.gridCount).toFixed(2)}`); // 调用 log
  } // 结束代码块

  /**
   * 是否存在网格持仓
   * Check if any grid has open position
   * @returns {boolean}
   * @private
   */
  _hasOpenGridPosition() { // 调用 _hasOpenGridPosition
    return this.grids.some(grid => grid.position > 0); // 返回结果
  } // 结束代码块

  /**
   * 重置超出区间跟踪
   * Reset out-of-range tracking
   * @private
   */
  _resetOutOfRangeTracking() { // 调用 _resetOutOfRangeTracking
    this._outOfRangeStreak = 0; // 重置连续次数
    this._outOfRangeStartTs = null; // 重置开始时间
    this.setIndicator('outOfRangeStreak', 0); // 调用 setIndicator
    this.setIndicator('outOfRangeMs', 0); // 调用 setIndicator
  } // 结束代码块

  /**
   * 判断是否满足自动调整条件
   * Determine if auto adjust should be triggered
   * @param {number} nowTs - 当前时间戳 / Current timestamp
   * @returns {boolean}
   * @private
   */
  _shouldAutoAdjust(nowTs) { // 调用 _shouldAutoAdjust
    if (!this.autoRecenter) { // 条件判断 !this.autoRecenter
      return false; // 返回结果
    } // 结束代码块

    if (this.minRecenterIntervalMs > 0 && (nowTs - this._lastRecenterAt) < this.minRecenterIntervalMs) { // 条件判断 最小间隔
      return false; // 返回结果
    } // 结束代码块

    const elapsedMs = this._outOfRangeStartTs ? (nowTs - this._outOfRangeStartTs) : 0; // 定义常量 elapsedMs
    const tickReady = this.outOfRangeRecenterTicks > 0 && this._outOfRangeStreak >= this.outOfRangeRecenterTicks; // 定义常量 tickReady
    const timeReady = this.outOfRangeRecenterMs > 0 && elapsedMs >= this.outOfRangeRecenterMs; // 定义常量 timeReady

    if (!tickReady && !timeReady) { // 条件判断 !tickReady && !timeReady
      return false; // 返回结果
    } // 结束代码块

    if (!this.allowRecenterWithPosition && this._hasOpenGridPosition()) { // 条件判断 不允许持仓调整
      this.log('存在网格持仓，跳过自动调整 / Open grid positions detected, skip auto-adjust', 'warn'); // 调用 log
      return false; // 返回结果
    } // 结束代码块

    return true; // 返回结果
  } // 结束代码块

  /**
   * 计算重新锚定网格范围
   * Calculate recenter grid range
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {{ upper: number, lower: number }}
   * @private
   */
  _calculateRecenterRange(currentPrice) { // 调用 _calculateRecenterRange
    const widthPercent = Math.max(0.001, this.gridWidthPercent * this.recenterWidthMultiplier); // 定义常量 widthPercent
    const halfWidth = currentPrice * (widthPercent / 2); // 定义常量 halfWidth
    const upper = Math.round(currentPrice + halfWidth); // 定义常量 upper
    const lower = Math.max(0, Math.round(currentPrice - halfWidth)); // 定义常量 lower
    return { upper, lower }; // 返回结果
  } // 结束代码块

  /**
   * 计算扩网后的范围 (保持中心不变)
   * Calculate expanded range (keep center)
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {{ upper: number, lower: number }}
   * @private
   */
  _calculateExpandRange(currentPrice) { // 调用 _calculateExpandRange
    const center = (this.upperPrice + this.lowerPrice) / 2; // 定义常量 center
    const currentHalf = (this.upperPrice - this.lowerPrice) / 2; // 定义常量 currentHalf
    const distance = Math.abs(currentPrice - center); // 定义常量 distance
    const targetHalf = Math.max(currentHalf, distance * (1 + this.expandBufferPercent)); // 定义常量 targetHalf
    const upper = Math.round(center + targetHalf); // 定义常量 upper
    const lower = Math.max(0, Math.round(center - targetHalf)); // 定义常量 lower
    return { upper, lower }; // 返回结果
  } // 结束代码块

  /**
   * 执行自动调整
   * Execute auto adjustment
   * @param {number} currentPrice - 当前价格 / Current price
   * @param {number} nowTs - 当前时间戳 / Current timestamp
   * @private
   */
  _autoAdjustGridRange(currentPrice, nowTs) { // 调用 _autoAdjustGridRange
    const action = (this.outOfRangeAction || 'recenter').toLowerCase(); // 定义常量 action
    const range = action === 'expand' // 三元表达式
      ? this._calculateExpandRange(currentPrice) // 扩网
      : this._calculateRecenterRange(currentPrice); // 重新锚定

    this.log(`自动调整网格 / Auto-adjust grid (${action}): ${range.lower} - ${range.upper} (当前价格/current price: ${currentPrice})`); // 调用 log

    this.adjustGridRange(range.upper, range.lower); // 调用 adjustGridRange
    this._logGridInfo(); // 调用 _logGridInfo

    this._lastRecenterAt = nowTs; // 记录时间
    this._resetOutOfRangeTracking(); // 重置跟踪
  } // 结束代码块

  /**
   * 动态初始化网格范围 (从交易所获取当前价格)
   * Dynamically initialize grid range (get current price from exchange)
   * @private
   */
  async _initializeDynamicGridRange() { // 执行语句
    let currentPrice = null; // 定义变量 currentPrice

    // 方法1: 从历史K线获取最新价格 / Method 1: Get latest price from candle history
    if (this._candleHistory && this._candleHistory.length > 0) { // 条件判断 this._candleHistory && this._candleHistory.le...
      const lastCandle = this._candleHistory[this._candleHistory.length - 1]; // 定义常量 lastCandle
      currentPrice = lastCandle.close; // 赋值 currentPrice
      this.log(`从历史K线获取当前价格 / Got current price from candle history: ${currentPrice}`); // 调用 log
    } // 结束代码块

    // 方法2: 从引擎获取实时价格 / Method 2: Get real-time price from engine
    if (!currentPrice && this.engine && typeof this.engine.getCurrentPrice === 'function') { // 条件判断 !currentPrice && this.engine && typeof this.e...
      try { // 尝试执行
        currentPrice = await this.engine.getCurrentPrice(this.symbol); // 赋值 currentPrice
        this.log(`从引擎获取当前价格 / Got current price from engine: ${currentPrice}`); // 调用 log
      } catch (error) { // 执行语句
        this.log(`从引擎获取价格失败 / Failed to get price from engine: ${error.message}`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 方法3: 从交易所直接获取 / Method 3: Get directly from exchange
    if (!currentPrice && this.engine && this.engine.exchanges) { // 条件判断 !currentPrice && this.engine && this.engine.e...
      try { // 尝试执行
        const exchangeId = Object.keys(this.engine.exchanges)[0]; // 定义常量 exchangeId
        const exchange = this.engine.exchanges[exchangeId]; // 定义常量 exchange
        if (exchange) { // 条件判断 exchange
          const ticker = await exchange.fetchTicker(this.symbol); // 定义常量 ticker
          currentPrice = ticker.last || ticker.close; // 赋值 currentPrice
          this.log(`从交易所 ${exchangeId} 获取当前价格 / Got current price from exchange ${exchangeId}: ${currentPrice}`); // 调用 log
        } // 结束代码块
      } catch (error) { // 执行语句
        this.log(`从交易所获取价格失败 / Failed to get price from exchange: ${error.message}`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    if (!currentPrice) { // 条件判断 !currentPrice
      this.log('无法获取当前价格，使用默认网格范围 / Cannot get current price, using default grid range', 'error'); // 调用 log
      this.upperPrice = 100000; // 设置 upperPrice
      this.lowerPrice = 90000; // 设置 lowerPrice
    } else { // 执行语句
      // 基于当前价格和百分比计算网格范围
      // Calculate grid range based on current price and percentage
      const halfWidth = currentPrice * (this.gridWidthPercent / 2); // 定义常量 halfWidth
      this.upperPrice = Math.round(currentPrice + halfWidth); // 设置 upperPrice
      this.lowerPrice = Math.round(currentPrice - halfWidth); // 设置 lowerPrice
      this.log(`动态网格范围已设置 / Dynamic grid range set: ${this.lowerPrice} - ${this.upperPrice} (当前价格/current price: ${currentPrice})`); // 调用 log
    } // 结束代码块

    // 初始化网格 / Initialize grids
    this._initializeGrids(); // 调用 _initializeGrids
  } // 结束代码块

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) { // 执行语句
    const currentPrice = candle.close; // 定义常量 currentPrice

    // 备用初始化: 如果网格还未初始化，使用当前价格初始化
    // Fallback initialization: if grids not initialized, use current price
    if (!this._gridsInitialized && this.useDynamicPrice) { // 条件判断 !this._gridsInitialized && this.useDynamicPrice
      const halfWidth = currentPrice * (this.gridWidthPercent / 2); // 定义常量 halfWidth
      this.upperPrice = Math.round(currentPrice + halfWidth); // 设置 upperPrice
      this.lowerPrice = Math.round(currentPrice - halfWidth); // 设置 lowerPrice

      this.log(`从实时价格初始化网格 / Initializing grid from live price: ${currentPrice}`); // 调用 log
      this._initializeGrids(); // 调用 _initializeGrids
      this._logGridInfo(); // 调用 _logGridInfo
    } // 结束代码块

    // 检查网格是否已初始化 / Check if grids are initialized
    if (!this._gridsInitialized || this.grids.length === 0) { // 条件判断 !this._gridsInitialized || this.grids.length ...
      this.log(`网格未初始化，跳过 / Grids not initialized, skipping`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 检查价格是否在网格范围内 / Check if price is within grid range
    if (currentPrice < this.lowerPrice || currentPrice > this.upperPrice) { // 条件判断 currentPrice < this.lowerPrice || currentPric...
      const nowTs = candle.timestamp || Date.now(); // 定义常量 nowTs
      if (this._outOfRangeStartTs === null) { // 条件判断 _outOfRangeStartTs
        this._outOfRangeStartTs = nowTs; // 记录开始时间
      } // 结束代码块
      this._outOfRangeStreak += 1; // 连续次数+1

      const elapsedMs = nowTs - this._outOfRangeStartTs; // 定义常量 elapsedMs
      this.setIndicator('outOfRangeStreak', this._outOfRangeStreak); // 调用 setIndicator
      this.setIndicator('outOfRangeMs', elapsedMs); // 调用 setIndicator

      // 满足条件则自动调整 / Auto adjust when conditions met
      if (this._shouldAutoAdjust(nowTs)) { // 条件判断 _shouldAutoAdjust
        this._autoAdjustGridRange(currentPrice, nowTs); // 调用 _autoAdjustGridRange
      } else { // 执行语句
        // 价格超出范围，记录日志 / Price out of range, log warning
        this.log(`价格 ${currentPrice} 超出网格范围 [${this.lowerPrice}, ${this.upperPrice}] / Price out of grid range (streak=${this._outOfRangeStreak}, elapsed=${(elapsedMs / 60000).toFixed(1)}m)`, 'warn'); // 调用 log
      } // 结束代码块
      return; // 返回结果
    } else if (this._outOfRangeStreak > 0) { // 执行语句
      // 价格回到范围内，重置计数 / Price back in range, reset tracking
      this._resetOutOfRangeTracking(); // 调用 _resetOutOfRangeTracking
    } // 结束代码块

    // 遍历所有网格 / Iterate all grids
    for (const grid of this.grids) { // 循环 const grid of this.grids
      // 跳过最高和最低网格 / Skip highest and lowest grids
      if (grid.id === 0 || grid.id === this.gridCount) { // 条件判断 grid.id === 0 || grid.id === this.gridCount
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查是否触发买入 (价格下穿网格线) / Check for buy trigger (price crosses down through grid)
      if (currentPrice <= grid.price && !grid.buyTriggered && grid.position === 0) { // 条件判断 currentPrice <= grid.price && !grid.buyTrigge...
        // 触发买入 / Trigger buy
        this.log(`网格 ${grid.id} 买入触发 / Grid ${grid.id} buy triggered @ ${currentPrice}`); // 调用 log

        // 计算买入数量 / Calculate buy amount
        const amount = this.amountPerGrid / currentPrice; // 定义常量 amount

        // 执行买入 / Execute buy
        const order = this.buy(this.symbol, amount); // 定义常量 order

        if (order) { // 条件判断 order
          grid.buyTriggered = true; // 赋值 grid.buyTriggered
          grid.position = amount; // 赋值 grid.position
          grid.sellTriggered = false;  // 重置卖出触发 / Reset sell trigger
        } // 结束代码块
      } // 结束代码块

      // 检查是否触发卖出 (价格上穿下一个网格线) / Check for sell trigger (price crosses up through next grid)
      const nextGrid = this.grids[grid.id + 1]; // 定义常量 nextGrid
      if (nextGrid && currentPrice >= nextGrid.price && grid.buyTriggered && grid.position > 0) { // 条件判断 nextGrid && currentPrice >= nextGrid.price &&...
        // 触发卖出 / Trigger sell
        this.log(`网格 ${grid.id} 卖出触发 / Grid ${grid.id} sell triggered @ ${currentPrice}`); // 调用 log

        // 执行卖出 / Execute sell
        const order = this.sell(this.symbol, grid.position); // 定义常量 order

        if (order) { // 条件判断 order
          grid.sellTriggered = true; // 赋值 grid.sellTriggered
          grid.buyTriggered = false;  // 重置买入触发 / Reset buy trigger
          grid.position = 0; // 赋值 grid.position
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 保存网格状态 / Save grid state
    this._saveGridState(); // 调用 _saveGridState
  } // 结束代码块

  /**
   * 保存网格状态
   * Save grid state
   * @private
   */
  _saveGridState() { // 调用 _saveGridState
    // 计算活跃网格数 / Calculate active grid count
    let activeGrids = 0; // 定义变量 activeGrids
    let totalPosition = 0; // 定义变量 totalPosition

    for (const grid of this.grids) { // 循环 const grid of this.grids
      if (grid.position > 0) { // 条件判断 grid.position > 0
        activeGrids++; // 执行语句
        totalPosition += grid.position; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 保存状态 / Save state
    this.setState('activeGrids', activeGrids); // 调用 setState
    this.setState('totalPosition', totalPosition); // 调用 setState
    this.setIndicator('activeGrids', activeGrids); // 调用 setIndicator
  } // 结束代码块

  /**
   * 获取网格状态
   * Get grid status
   * @returns {Array} 网格状态数组 / Grid status array
   */
  getGridStatus() { // 调用 getGridStatus
    return this.grids.map(grid => ({ // 返回结果
      id: grid.id, // ID
      price: grid.price, // 价格
      buyTriggered: grid.buyTriggered, // buyTriggered
      sellTriggered: grid.sellTriggered, // sellTriggered
      position: grid.position, // 持仓
    })); // 结束代码块
  } // 结束代码块

  /**
   * 动态调整网格范围
   * Dynamically adjust grid range
   * @param {number} upper - 新上限 / New upper limit
   * @param {number} lower - 新下限 / New lower limit
   */
  adjustGridRange(upper, lower) { // 调用 adjustGridRange
    this.upperPrice = upper; // 设置 upperPrice
    this.lowerPrice = lower; // 设置 lowerPrice

    // 重新初始化网格 / Reinitialize grids
    this.grids = []; // 设置 grids
    this._initializeGrids(); // 调用 _initializeGrids

    this.log(`网格范围已调整 / Grid range adjusted: ${lower} - ${upper}`); // 调用 log
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default GridStrategy; // 默认导出
