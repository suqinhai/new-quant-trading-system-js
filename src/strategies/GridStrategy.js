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

    // 网格上限价格 / Grid upper price
    this.upperPrice = params.upperPrice || 50000;

    // 网格下限价格 / Grid lower price
    this.lowerPrice = params.lowerPrice || 30000;

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

    // 初始化网格 / Initialize grids
    this._initializeGrids();
  }

  /**
   * 初始化网格
   * Initialize grids
   * @private
   */
  _initializeGrids() {
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
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`网格范围 / Grid Range: ${this.lowerPrice} - ${this.upperPrice}`);
    this.log(`网格数量 / Grid Count: ${this.gridCount}`);
    this.log(`网格间距 / Grid Spacing: ${((this.upperPrice - this.lowerPrice) / this.gridCount).toFixed(2)}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    const currentPrice = candle.close;

    // 检查价格是否在网格范围内 / Check if price is within grid range
    if (currentPrice < this.lowerPrice || currentPrice > this.upperPrice) {
      // 价格超出范围，可以选择发出警告 / Price out of range, optionally warn
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
