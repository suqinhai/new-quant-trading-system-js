/**
 * 网格交易策略
 * Grid Trading Strategy
 *
 * 在价格区间内设置多个买卖网格，实现自动低买高卖
 * Sets multiple buy/sell grids within a price range for automatic buy low sell high
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

/**
 * 网格策略类
 * Grid Strategy Class
 */
export class GridStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'GridStrategy',
      ...params,
    });

    // 网格宽度百分比 (基于当前价格) / Grid width percentage (based on current price)
    // 例如 0.1 表示上下各 5%，总范围 10%
    // e.g., 0.1 means 5% above and below, 10% total range
    this.gridWidthPercent = params.gridWidthPercent || 0.1;

    // 网格上限价格 (将在 onInit 中动态设置) / Grid upper price (will be set dynamically in onInit)
    this.upperPrice = params.upperPrice || null;

    // 网格下限价格 (将在 onInit 中动态设置) / Grid lower price (will be set dynamically in onInit)
    this.lowerPrice = params.lowerPrice || null;

    // 是否使用动态价格初始化 / Whether to use dynamic price initialization
    this.useDynamicPrice = params.useDynamicPrice !== false;

    // 网格数量 / Number of grids
    this.gridCount = params.gridCount || 10;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 每格投资金额 / Investment per grid
    this.amountPerGrid = params.amountPerGrid || 100;

    // 网格数组 / Grid array
    this.grids = [];

    // 已触发的网格 / Triggered grids
    this.triggeredGrids = new Map();

    // 网格是否已初始化 / Whether grids are initialized
    this._gridsInitialized = false;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 网格策略需要实时价格 / Grid strategy needs real-time ticker
    return ['ticker'];
  }

  /**
   * 初始化网格
   * Initialize grids
   * @private
   */
  _initializeGrids() {
    // 清空现有网格 / Clear existing grids
    this.grids = [];

    // 计算网格间距 / Calculate grid spacing
    const gridSpacing = (this.upperPrice - this.lowerPrice) / this.gridCount;

    // 创建网格 / Create grids
    for (let i = 0; i <= this.gridCount; i++) {
      const price = this.lowerPrice + i * gridSpacing;
      this.grids.push({
        id: i,                      // 网格 ID / Grid ID
        price,                      // 网格价格 / Grid price
        buyTriggered: false,        // 是否已触发买入 / Buy triggered
        sellTriggered: false,       // 是否已触发卖出 / Sell triggered
        position: 0,                // 该网格持仓 / Grid position
      });
    }

    // 标记网格已初始化 / Mark grids as initialized
    this._gridsInitialized = true;
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    // 如果手动设置了上下限，直接初始化网格
    // If upper/lower limits are manually set, initialize grids directly
    if (!this.useDynamicPrice && this.upperPrice !== null && this.lowerPrice !== null) {
      this._initializeGrids();
      this._logGridInfo();
    }
    // 否则延迟到 initCandleHistory 或 onTick 时初始化
    // Otherwise delay initialization to initCandleHistory or onTick
  }

  /**
   * 初始化 K 线历史数据后回调 - 用于动态初始化网格
   * Callback after candle history is initialized - for dynamic grid initialization
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} candles - 历史 K 线数据 / Historical candle data
   */
  initCandleHistory(symbol, candles) {
    // 调用父类方法 / Call parent method
    super.initCandleHistory(symbol, candles);

    // 如果网格未初始化且使用动态价格，尝试从历史数据初始化
    // If grids not initialized and using dynamic price, try to initialize from history
    if (!this._gridsInitialized && this.useDynamicPrice) {
      this._initializeGridsFromHistory();
    }
  }

  /**
   * 从历史数据初始化网格
   * Initialize grids from historical data
   * @private
   */
  _initializeGridsFromHistory() {
    if (this._candleHistory && this._candleHistory.length > 0) {
      const lastCandle = this._candleHistory[this._candleHistory.length - 1];
      const currentPrice = lastCandle.close;

      // 基于当前价格和百分比计算网格范围
      // Calculate grid range based on current price and percentage
      const halfWidth = currentPrice * (this.gridWidthPercent / 2);
      this.upperPrice = Math.round(currentPrice + halfWidth);
      this.lowerPrice = Math.round(currentPrice - halfWidth);

      this.log(`从历史数据初始化网格 / Initializing grid from history: 当前价格=${currentPrice}`);
      this._initializeGrids();
      this._logGridInfo();
    }
  }

  /**
   * 输出网格信息日志
   * Log grid information
   * @private
   */
  _logGridInfo() {
    this.log(`网格范围 / Grid Range: ${this.lowerPrice} - ${this.upperPrice}`);
    this.log(`网格数量 / Grid Count: ${this.gridCount}`);
    this.log(`网格间距 / Grid Spacing: ${((this.upperPrice - this.lowerPrice) / this.gridCount).toFixed(2)}`);
  }

  /**
   * 动态初始化网格范围 (从交易所获取当前价格)
   * Dynamically initialize grid range (get current price from exchange)
   * @private
   */
  async _initializeDynamicGridRange() {
    let currentPrice = null;

    // 方法1: 从历史K线获取最新价格 / Method 1: Get latest price from candle history
    if (this._candleHistory && this._candleHistory.length > 0) {
      const lastCandle = this._candleHistory[this._candleHistory.length - 1];
      currentPrice = lastCandle.close;
      this.log(`从历史K线获取当前价格 / Got current price from candle history: ${currentPrice}`);
    }

    // 方法2: 从引擎获取实时价格 / Method 2: Get real-time price from engine
    if (!currentPrice && this.engine && typeof this.engine.getCurrentPrice === 'function') {
      try {
        currentPrice = await this.engine.getCurrentPrice(this.symbol);
        this.log(`从引擎获取当前价格 / Got current price from engine: ${currentPrice}`);
      } catch (error) {
        this.log(`从引擎获取价格失败 / Failed to get price from engine: ${error.message}`, 'warn');
      }
    }

    // 方法3: 从交易所直接获取 / Method 3: Get directly from exchange
    if (!currentPrice && this.engine && this.engine.exchanges) {
      try {
        const exchangeId = Object.keys(this.engine.exchanges)[0];
        const exchange = this.engine.exchanges[exchangeId];
        if (exchange) {
          const ticker = await exchange.fetchTicker(this.symbol);
          currentPrice = ticker.last || ticker.close;
          this.log(`从交易所 ${exchangeId} 获取当前价格 / Got current price from exchange ${exchangeId}: ${currentPrice}`);
        }
      } catch (error) {
        this.log(`从交易所获取价格失败 / Failed to get price from exchange: ${error.message}`, 'warn');
      }
    }

    if (!currentPrice) {
      this.log('无法获取当前价格，使用默认网格范围 / Cannot get current price, using default grid range', 'error');
      this.upperPrice = 100000;
      this.lowerPrice = 90000;
    } else {
      // 基于当前价格和百分比计算网格范围
      // Calculate grid range based on current price and percentage
      const halfWidth = currentPrice * (this.gridWidthPercent / 2);
      this.upperPrice = Math.round(currentPrice + halfWidth);
      this.lowerPrice = Math.round(currentPrice - halfWidth);
      this.log(`动态网格范围已设置 / Dynamic grid range set: ${this.lowerPrice} - ${this.upperPrice} (当前价格/current price: ${currentPrice})`);
    }

    // 初始化网格 / Initialize grids
    this._initializeGrids();
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    const currentPrice = candle.close;

    // 备用初始化: 如果网格还未初始化，使用当前价格初始化
    // Fallback initialization: if grids not initialized, use current price
    if (!this._gridsInitialized && this.useDynamicPrice) {
      const halfWidth = currentPrice * (this.gridWidthPercent / 2);
      this.upperPrice = Math.round(currentPrice + halfWidth);
      this.lowerPrice = Math.round(currentPrice - halfWidth);

      this.log(`从实时价格初始化网格 / Initializing grid from live price: ${currentPrice}`);
      this._initializeGrids();
      this._logGridInfo();
    }

    // 检查网格是否已初始化 / Check if grids are initialized
    if (!this._gridsInitialized || this.grids.length === 0) {
      this.log(`网格未初始化，跳过 / Grids not initialized, skipping`, 'warn');
      return;
    }

    // 检查价格是否在网格范围内 / Check if price is within grid range
    if (currentPrice < this.lowerPrice || currentPrice > this.upperPrice) {
      // 价格超出范围，记录日志 / Price out of range, log warning
      this.log(`价格 ${currentPrice} 超出网格范围 [${this.lowerPrice}, ${this.upperPrice}] / Price out of grid range`, 'warn');
      return;
    }

    // 遍历所有网格 / Iterate all grids
    for (const grid of this.grids) {
      // 跳过最高和最低网格 / Skip highest and lowest grids
      if (grid.id === 0 || grid.id === this.gridCount) {
        continue;
      }

      // 检查是否触发买入 (价格下穿网格线) / Check for buy trigger (price crosses down through grid)
      if (currentPrice <= grid.price && !grid.buyTriggered && grid.position === 0) {
        // 触发买入 / Trigger buy
        this.log(`网格 ${grid.id} 买入触发 / Grid ${grid.id} buy triggered @ ${currentPrice}`);

        // 计算买入数量 / Calculate buy amount
        const amount = this.amountPerGrid / currentPrice;

        // 执行买入 / Execute buy
        const order = this.buy(this.symbol, amount);

        if (order) {
          grid.buyTriggered = true;
          grid.position = amount;
          grid.sellTriggered = false;  // 重置卖出触发 / Reset sell trigger
        }
      }

      // 检查是否触发卖出 (价格上穿下一个网格线) / Check for sell trigger (price crosses up through next grid)
      const nextGrid = this.grids[grid.id + 1];
      if (nextGrid && currentPrice >= nextGrid.price && grid.buyTriggered && grid.position > 0) {
        // 触发卖出 / Trigger sell
        this.log(`网格 ${grid.id} 卖出触发 / Grid ${grid.id} sell triggered @ ${currentPrice}`);

        // 执行卖出 / Execute sell
        const order = this.sell(this.symbol, grid.position);

        if (order) {
          grid.sellTriggered = true;
          grid.buyTriggered = false;  // 重置买入触发 / Reset buy trigger
          grid.position = 0;
        }
      }
    }

    // 保存网格状态 / Save grid state
    this._saveGridState();
  }

  /**
   * 保存网格状态
   * Save grid state
   * @private
   */
  _saveGridState() {
    // 计算活跃网格数 / Calculate active grid count
    let activeGrids = 0;
    let totalPosition = 0;

    for (const grid of this.grids) {
      if (grid.position > 0) {
        activeGrids++;
        totalPosition += grid.position;
      }
    }

    // 保存状态 / Save state
    this.setState('activeGrids', activeGrids);
    this.setState('totalPosition', totalPosition);
    this.setIndicator('activeGrids', activeGrids);
  }

  /**
   * 获取网格状态
   * Get grid status
   * @returns {Array} 网格状态数组 / Grid status array
   */
  getGridStatus() {
    return this.grids.map(grid => ({
      id: grid.id,
      price: grid.price,
      buyTriggered: grid.buyTriggered,
      sellTriggered: grid.sellTriggered,
      position: grid.position,
    }));
  }

  /**
   * 动态调整网格范围
   * Dynamically adjust grid range
   * @param {number} upper - 新上限 / New upper limit
   * @param {number} lower - 新下限 / New lower limit
   */
  adjustGridRange(upper, lower) {
    this.upperPrice = upper;
    this.lowerPrice = lower;

    // 重新初始化网格 / Reinitialize grids
    this.grids = [];
    this._initializeGrids();

    this.log(`网格范围已调整 / Grid range adjusted: ${lower} - ${upper}`);
  }
}

// 导出默认类 / Export default class
export default GridStrategy;
