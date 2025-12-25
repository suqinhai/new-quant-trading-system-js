/**
 * 冰山单 / 智能拆单执行器
 * Iceberg / Smart Split Order Executor
 *
 * 功能 / Features:
 * 1. 冰山单执行（隐藏真实订单量）/ Iceberg order execution (hide real order size)
 * 2. 智能拆单（基于流动性）/ Smart order splitting (based on liquidity)
 * 3. 随机化执行（避免被检测）/ Randomized execution (avoid detection)
 * 4. 动态显示量调整 / Dynamic display size adjustment
 * 5. 市场冲击最小化 / Market impact minimization
 */

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 拆单策略类型
 * Split strategy types
 */
export const SPLIT_STRATEGY = {
  FIXED: 'fixed',           // 固定大小 / Fixed size
  PERCENTAGE: 'percentage', // 百分比 / Percentage
  LIQUIDITY: 'liquidity',   // 基于流动性 / Liquidity based
  ADAPTIVE: 'adaptive',     // 自适应 / Adaptive
  RANDOM: 'random',         // 随机 / Random
};

/**
 * 订单显示模式
 * Order display modes
 */
export const DISPLAY_MODE = {
  FIXED: 'fixed',           // 固定显示量 / Fixed display size
  RANDOM: 'random',         // 随机显示量 / Random display size
  DYNAMIC: 'dynamic',       // 动态显示量 / Dynamic display size
};

/**
 * 冰山单状态
 * Iceberg order status
 */
export const ICEBERG_STATUS = {
  PENDING: 'pending',       // 等待 / Pending
  ACTIVE: 'active',         // 活跃 / Active
  PAUSED: 'paused',         // 暂停 / Paused
  COMPLETED: 'completed',   // 完成 / Completed
  CANCELED: 'canceled',     // 取消 / Canceled
  FAILED: 'failed',         // 失败 / Failed
};

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // 默认显示比例 / Default display ratio
  defaultDisplayRatio: 0.1,  // 10%

  // 最小显示量（相对于最小交易单位）/ Minimum display size
  minDisplayMultiple: 5,

  // 最大显示量（相对于总量）/ Maximum display ratio
  maxDisplayRatio: 0.3,  // 30%

  // 随机化范围 / Randomization range
  randomRange: 0.2,  // ±20%

  // 子订单间隔（毫秒）/ Sub-order interval (ms)
  subOrderInterval: 1000,

  // 子订单间隔随机范围（毫秒）/ Sub-order interval random range (ms)
  intervalRandomRange: 500,

  // 最大并发子订单数 / Max concurrent sub-orders
  maxConcurrentOrders: 3,

  // 子订单超时时间（毫秒）/ Sub-order timeout (ms)
  subOrderTimeout: 30000,

  // 价格追踪间隔（毫秒）/ Price tracking interval (ms)
  priceTrackInterval: 500,

  // 价格滑动容忍度 / Price sliding tolerance
  priceSlipTolerance: 0.002,  // 0.2%

  // 是否启用反检测 / Enable anti-detection
  enableAntiDetection: true,

  // 反检测：最大连续相同大小订单数 / Anti-detection: max consecutive same-size orders
  maxConsecutiveSameSize: 2,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,
};

// ============================================
// 拆单计算器 / Split Calculator
// ============================================

/**
 * 智能拆单计算器
 * Smart split calculator
 */
class SplitCalculator {
  /**
   * 计算固定大小拆单
   * Calculate fixed size splits
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} splitSize - 每份大小 / Split size
   * @returns {Array} 拆单列表 / Split list
   */
  static fixedSplit(totalSize, splitSize) {
    const splits = [];
    let remaining = totalSize;

    while (remaining > 0) {
      const size = Math.min(splitSize, remaining);
      splits.push({ size, type: 'fixed' });
      remaining -= size;
    }

    return splits;
  }

  /**
   * 计算百分比拆单
   * Calculate percentage splits
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} percentage - 每份百分比 / Split percentage
   * @returns {Array} 拆单列表 / Split list
   */
  static percentageSplit(totalSize, percentage) {
    const splitSize = totalSize * percentage;
    return this.fixedSplit(totalSize, splitSize);
  }

  /**
   * 基于流动性的智能拆单
   * Liquidity-based smart split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {Object} liquidityInfo - 流动性信息 / Liquidity info
   * @returns {Array} 拆单列表 / Split list
   */
  static liquiditySplit(totalSize, liquidityInfo) {
    const {
      bidDepth = 0,           // 买盘深度 / Bid depth
      askDepth = 0,           // 卖盘深度 / Ask depth
      spread = 0.001,         // 买卖价差 / Spread
      avgTradeSize = 0,       // 平均成交量 / Average trade size
    } = liquidityInfo;

    // 计算可用流动性 / Calculate available liquidity
    const availableLiquidity = Math.max(bidDepth, askDepth);

    // 目标：每个子订单不超过可用流动性的 5% / Target: each sub-order <= 5% of liquidity
    let targetSplitSize = availableLiquidity * 0.05;

    // 如果有平均成交量数据，也参考它 / Also consider average trade size if available
    if (avgTradeSize > 0) {
      targetSplitSize = Math.min(targetSplitSize, avgTradeSize * 3);
    }

    // 根据价差调整：价差越大，拆分越细 / Adjust based on spread: larger spread = finer splits
    if (spread > 0.002) {
      targetSplitSize *= 0.7;
    } else if (spread > 0.005) {
      targetSplitSize *= 0.5;
    }

    // 确保至少拆成 5 份 / Ensure at least 5 splits
    targetSplitSize = Math.min(targetSplitSize, totalSize / 5);

    // 确保每份不太小 / Ensure each split is not too small
    targetSplitSize = Math.max(targetSplitSize, totalSize / 50);

    return this.fixedSplit(totalSize, targetSplitSize);
  }

  /**
   * 自适应拆单
   * Adaptive split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {Object} marketCondition - 市场状况 / Market condition
   * @returns {Array} 拆单列表 / Split list
   */
  static adaptiveSplit(totalSize, marketCondition) {
    const {
      volatility = 'normal',  // 波动性 / Volatility
      liquidity = 'medium',   // 流动性 / Liquidity
      urgency = 'normal',     // 紧迫性 / Urgency
    } = marketCondition;

    // 基础拆分比例 / Base split ratio
    let splitRatio = 0.1;  // 10%

    // 根据波动性调整 / Adjust based on volatility
    switch (volatility) {
      case 'high':
        splitRatio *= 0.5;  // 高波动：更细的拆分 / High volatility: finer splits
        break;
      case 'low':
        splitRatio *= 1.5;  // 低波动：可以大一些 / Low volatility: can be larger
        break;
    }

    // 根据流动性调整 / Adjust based on liquidity
    switch (liquidity) {
      case 'high':
        splitRatio *= 1.5;  // 高流动性：可以大一些 / High liquidity: can be larger
        break;
      case 'low':
        splitRatio *= 0.5;  // 低流动性：更细的拆分 / Low liquidity: finer splits
        break;
    }

    // 根据紧迫性调整 / Adjust based on urgency
    switch (urgency) {
      case 'high':
        splitRatio *= 1.3;  // 紧急：大一些，快点完成 / Urgent: larger, faster completion
        break;
      case 'low':
        splitRatio *= 0.8;  // 不紧急：细一些，减少冲击 / Not urgent: finer, less impact
        break;
    }

    // 限制范围 / Limit range
    splitRatio = Math.max(0.02, Math.min(0.3, splitRatio));

    return this.percentageSplit(totalSize, splitRatio);
  }

  /**
   * 随机拆单
   * Random split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} avgSplitRatio - 平均拆分比例 / Average split ratio
   * @param {number} randomRange - 随机范围 / Random range
   * @returns {Array} 拆单列表 / Split list
   */
  static randomSplit(totalSize, avgSplitRatio = 0.1, randomRange = 0.3) {
    const splits = [];
    let remaining = totalSize;
    const avgSize = totalSize * avgSplitRatio;

    while (remaining > avgSize * 0.5) {
      // 随机生成大小 / Generate random size
      const randomFactor = 1 + (Math.random() * 2 - 1) * randomRange;
      let size = avgSize * randomFactor;

      // 确保不超过剩余量 / Ensure not exceeding remaining
      size = Math.min(size, remaining);

      // 如果剩余量很小，直接全部执行 / If remaining is small, execute all
      if (remaining - size < avgSize * 0.3) {
        size = remaining;
      }

      splits.push({
        size,
        type: 'random',
        randomFactor,
      });

      remaining -= size;
    }

    // 处理剩余 / Handle remaining
    if (remaining > 0) {
      splits.push({
        size: remaining,
        type: 'random_remainder',
      });
    }

    return splits;
  }
}

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 冰山单执行器
 * Iceberg Order Executor
 */
export class IcebergOrderExecutor extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 活跃冰山单 / Active iceberg orders
    // 格式: { icebergId: IcebergOrder }
    this.activeIcebergs = new Map();

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null;

    // 盘口分析器引用 / Order book analyzer reference
    this.orderBookAnalyzer = null;

    // 上一个子订单大小（用于反检测）/ Last sub-order size (for anti-detection)
    this.lastSubOrderSizes = new Map();

    // 统计信息 / Statistics
    this.stats = {
      totalIcebergs: 0,         // 总冰山单数 / Total iceberg orders
      completedIcebergs: 0,     // 完成数 / Completed
      canceledIcebergs: 0,      // 取消数 / Canceled
      totalSubOrders: 0,        // 总子订单数 / Total sub-orders
      totalVolume: 0,           // 总成交量 / Total volume
      avgSubOrderSize: 0,       // 平均子订单大小 / Average sub-order size
      avgCompletionTime: 0,     // 平均完成时间 / Average completion time
    };
  }

  // ============================================
  // 初始化 / Initialization
  // ============================================

  /**
   * 初始化执行器
   * Initialize executor
   *
   * @param {Object} dependencies - 依赖项 / Dependencies
   */
  init(dependencies = {}) {
    const { orderExecutor, orderBookAnalyzer } = dependencies;

    this.orderExecutor = orderExecutor;
    this.orderBookAnalyzer = orderBookAnalyzer;

    this.log('冰山单执行器初始化完成 / Iceberg executor initialized', 'info');
  }

  // ============================================
  // 核心执行方法 / Core Execution Methods
  // ============================================

  /**
   * 创建冰山单
   * Create iceberg order
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @returns {Object} 冰山单对象 / Iceberg order object
   */
  createIcebergOrder(params) {
    const {
      exchangeId,                                      // 交易所 ID / Exchange ID
      symbol,                                          // 交易对 / Symbol
      side,                                            // 方向 / Side
      totalSize,                                       // 总量 / Total size
      displaySize = null,                              // 显示量 / Display size
      displayMode = DISPLAY_MODE.RANDOM,               // 显示模式 / Display mode
      splitStrategy = SPLIT_STRATEGY.ADAPTIVE,         // 拆单策略 / Split strategy
      limitPrice = null,                               // 限价 / Limit price
      priceType = 'limit',                             // 价格类型 / Price type
      options = {},                                    // 额外选项 / Extra options
    } = params;

    // 生成冰山单 ID / Generate iceberg ID
    const icebergId = `iceberg_${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 计算显示量 / Calculate display size
    let calculatedDisplaySize = displaySize;
    if (!calculatedDisplaySize) {
      calculatedDisplaySize = totalSize * this.config.defaultDisplayRatio;
    }

    // 应用显示量限制 / Apply display size limits
    calculatedDisplaySize = Math.min(
      calculatedDisplaySize,
      totalSize * this.config.maxDisplayRatio
    );

    // 计算拆单 / Calculate splits
    const splits = this._calculateSplits(totalSize, splitStrategy, params);

    // 创建冰山单对象 / Create iceberg order object
    const iceberg = {
      // 基本信息 / Basic info
      icebergId,
      exchangeId,
      symbol,
      side,

      // 数量信息 / Size info
      totalSize,
      displaySize: calculatedDisplaySize,
      displayMode,
      executedSize: 0,
      remainingSize: totalSize,

      // 拆单信息 / Split info
      splitStrategy,
      splits,
      currentSplitIndex: 0,

      // 价格信息 / Price info
      limitPrice,
      priceType,
      avgExecutionPrice: 0,
      totalCost: 0,

      // 状态 / Status
      status: ICEBERG_STATUS.PENDING,

      // 子订单记录 / Sub-order records
      subOrders: [],
      activeSubOrders: new Map(),

      // 时间信息 / Time info
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,

      // 选项 / Options
      options,
    };

    // 保存冰山单 / Save iceberg order
    this.activeIcebergs.set(icebergId, iceberg);

    // 更新统计 / Update stats
    this.stats.totalIcebergs++;

    // 发出事件 / Emit event
    this.emit('icebergCreated', { iceberg });

    // 记录日志 / Log
    this.log(
      `创建冰山单: ${icebergId}, ${symbol} ${side} ${totalSize}, ` +
      `显示量 ${calculatedDisplaySize}, 拆分 ${splits.length} 份 / ` +
      `Created iceberg order`,
      'info'
    );

    return iceberg;
  }

  /**
   * 启动冰山单执行
   * Start iceberg order execution
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   * @returns {Promise<void>}
   */
  async startIceberg(icebergId) {
    const iceberg = this.activeIcebergs.get(icebergId);

    if (!iceberg) {
      throw new Error(`冰山单不存在 / Iceberg not found: ${icebergId}`);
    }

    if (iceberg.status !== ICEBERG_STATUS.PENDING && iceberg.status !== ICEBERG_STATUS.PAUSED) {
      throw new Error(`冰山单状态不允许启动 / Iceberg status does not allow starting: ${iceberg.status}`);
    }

    // 更新状态 / Update status
    iceberg.status = ICEBERG_STATUS.ACTIVE;
    iceberg.startedAt = iceberg.startedAt || Date.now();

    // 发出事件 / Emit event
    this.emit('icebergStarted', { iceberg });

    // 记录日志 / Log
    this.log(`启动冰山单: ${icebergId} / Started iceberg: ${icebergId}`, 'info');

    // 开始执行循环 / Start execution loop
    await this._runIcebergLoop(iceberg);
  }

  /**
   * 暂停冰山单
   * Pause iceberg order
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   */
  pauseIceberg(icebergId) {
    const iceberg = this.activeIcebergs.get(icebergId);

    if (!iceberg || iceberg.status !== ICEBERG_STATUS.ACTIVE) {
      return false;
    }

    iceberg.status = ICEBERG_STATUS.PAUSED;
    this.emit('icebergPaused', { iceberg });
    this.log(`暂停冰山单: ${icebergId} / Paused iceberg: ${icebergId}`, 'info');

    return true;
  }

  /**
   * 取消冰山单
   * Cancel iceberg order
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   */
  async cancelIceberg(icebergId) {
    const iceberg = this.activeIcebergs.get(icebergId);

    if (!iceberg) {
      return false;
    }

    // 取消所有活跃子订单 / Cancel all active sub-orders
    for (const [subOrderId, subOrder] of iceberg.activeSubOrders) {
      try {
        if (this.orderExecutor) {
          await this.orderExecutor.cancelOrder(subOrderId);
        }
      } catch (error) {
        this.log(`取消子订单失败: ${error.message} / Failed to cancel sub-order`, 'warn');
      }
    }

    // 更新状态 / Update status
    iceberg.status = ICEBERG_STATUS.CANCELED;
    iceberg.completedAt = Date.now();

    // 最终化 / Finalize
    this._finalizeIceberg(iceberg);

    // 更新统计 / Update stats
    this.stats.canceledIcebergs++;

    // 发出事件 / Emit event
    this.emit('icebergCanceled', { iceberg });

    // 记录日志 / Log
    this.log(
      `取消冰山单: ${icebergId}, 已执行 ${iceberg.executedSize}/${iceberg.totalSize} / ` +
      `Canceled iceberg`,
      'info'
    );

    return true;
  }

  // ============================================
  // 执行循环 / Execution Loop
  // ============================================

  /**
   * 运行冰山单执行循环
   * Run iceberg execution loop
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @private
   */
  async _runIcebergLoop(iceberg) {
    while (iceberg.status === ICEBERG_STATUS.ACTIVE) {
      // 检查是否还有剩余量 / Check if there's remaining size
      if (iceberg.remainingSize <= 0) {
        iceberg.status = ICEBERG_STATUS.COMPLETED;
        break;
      }

      // 检查并发限制 / Check concurrency limit
      if (iceberg.activeSubOrders.size >= this.config.maxConcurrentOrders) {
        // 等待一个子订单完成 / Wait for a sub-order to complete
        await this._waitForSubOrderCompletion(iceberg);
        continue;
      }

      // 计算下一个子订单 / Calculate next sub-order
      const subOrderParams = this._calculateNextSubOrder(iceberg);

      if (!subOrderParams) {
        // 没有更多子订单，等待活跃订单完成 / No more sub-orders, wait for active ones
        if (iceberg.activeSubOrders.size > 0) {
          await this._waitForSubOrderCompletion(iceberg);
          continue;
        } else {
          break;
        }
      }

      // 执行子订单 / Execute sub-order
      try {
        await this._executeSubOrder(iceberg, subOrderParams);
      } catch (error) {
        this.log(`子订单执行失败: ${error.message} / Sub-order execution failed`, 'error');

        // 检查是否需要停止 / Check if should stop
        if (this._shouldStopOnError(iceberg, error)) {
          iceberg.status = ICEBERG_STATUS.FAILED;
          iceberg.error = error.message;
          break;
        }
      }

      // 等待间隔 / Wait interval
      const interval = this._calculateInterval();
      await this._sleep(interval);
    }

    // 等待所有活跃子订单完成 / Wait for all active sub-orders to complete
    while (iceberg.activeSubOrders.size > 0) {
      await this._waitForSubOrderCompletion(iceberg);
    }

    // 完成处理 / Finalize
    if (iceberg.status === ICEBERG_STATUS.ACTIVE) {
      iceberg.status = ICEBERG_STATUS.COMPLETED;
    }
    iceberg.completedAt = Date.now();

    this._finalizeIceberg(iceberg);
  }

  /**
   * 计算下一个子订单参数
   * Calculate next sub-order parameters
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @returns {Object|null} 子订单参数 / Sub-order parameters
   * @private
   */
  _calculateNextSubOrder(iceberg) {
    // 检查是否还有拆分 / Check if there are more splits
    if (iceberg.currentSplitIndex >= iceberg.splits.length) {
      // 检查是否有剩余量需要处理 / Check if there's remaining size to handle
      if (iceberg.remainingSize > 0) {
        // 创建补充子订单 / Create supplementary sub-order
        return {
          size: iceberg.remainingSize,
          isSupplementary: true,
        };
      }
      return null;
    }

    // 获取当前拆分 / Get current split
    const split = iceberg.splits[iceberg.currentSplitIndex];

    // 计算实际大小 / Calculate actual size
    let size = Math.min(split.size, iceberg.remainingSize);

    // 应用显示模式 / Apply display mode
    size = this._applyDisplayMode(iceberg, size);

    // 应用反检测 / Apply anti-detection
    if (this.config.enableAntiDetection) {
      size = this._applyAntiDetection(iceberg, size);
    }

    // 确保大小有效 / Ensure size is valid
    if (size <= 0) {
      return null;
    }

    // 移动到下一个拆分 / Move to next split
    iceberg.currentSplitIndex++;

    return {
      size,
      splitIndex: iceberg.currentSplitIndex - 1,
      originalSplitSize: split.size,
    };
  }

  /**
   * 执行子订单
   * Execute sub-order
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {Object} subOrderParams - 子订单参数 / Sub-order parameters
   * @private
   */
  async _executeSubOrder(iceberg, subOrderParams) {
    const { size, splitIndex, isSupplementary } = subOrderParams;

    // 获取当前价格 / Get current price
    let price = iceberg.limitPrice;
    if (!price && this.orderBookAnalyzer) {
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(iceberg.symbol);
      if (orderBook) {
        price = iceberg.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid;
      }
    }

    // 创建子订单记录 / Create sub-order record
    const subOrder = {
      subOrderId: `${iceberg.icebergId}_sub_${iceberg.subOrders.length}`,
      size,
      price,
      splitIndex,
      isSupplementary: !!isSupplementary,
      status: 'pending',
      createdAt: Date.now(),
      executedSize: 0,
      avgPrice: 0,
    };

    // 添加到记录 / Add to records
    iceberg.subOrders.push(subOrder);
    iceberg.activeSubOrders.set(subOrder.subOrderId, subOrder);

    // 更新统计 / Update stats
    this.stats.totalSubOrders++;

    try {
      // 执行订单 / Execute order
      if (this.orderExecutor) {
        const result = await this.orderExecutor.executeSmartLimitOrder({
          exchangeId: iceberg.exchangeId,
          symbol: iceberg.symbol,
          side: iceberg.side,
          amount: size,
          price: price,
          postOnly: false,
          options: {
            icebergId: iceberg.icebergId,
            subOrderId: subOrder.subOrderId,
          },
        });

        // 更新子订单状态 / Update sub-order status
        subOrder.status = 'completed';
        subOrder.executedSize = result.orderInfo?.filledAmount || size;
        subOrder.avgPrice = result.orderInfo?.avgPrice || price;
        subOrder.completedAt = Date.now();

      } else {
        // 模拟执行 / Simulated execution
        subOrder.status = 'simulated';
        subOrder.executedSize = size;
        subOrder.avgPrice = price;
        subOrder.completedAt = Date.now();
      }

      // 更新冰山单状态 / Update iceberg status
      iceberg.executedSize += subOrder.executedSize;
      iceberg.remainingSize -= subOrder.executedSize;
      iceberg.totalCost += subOrder.executedSize * subOrder.avgPrice;
      iceberg.avgExecutionPrice = iceberg.totalCost / iceberg.executedSize;

      // 记录最后子订单大小（用于反检测）/ Record last sub-order size
      this._recordLastSubOrderSize(iceberg.icebergId, size);

      // 发出事件 / Emit event
      this.emit('subOrderCompleted', {
        iceberg,
        subOrder,
        progress: iceberg.executedSize / iceberg.totalSize,
      });

      // 记录日志 / Log
      this.log(
        `子订单完成: ${subOrder.subOrderId}, ` +
        `${subOrder.executedSize} @ ${subOrder.avgPrice?.toFixed(2)}, ` +
        `进度 ${((iceberg.executedSize / iceberg.totalSize) * 100).toFixed(1)}% / ` +
        `Sub-order completed`,
        'info'
      );

    } catch (error) {
      subOrder.status = 'failed';
      subOrder.error = error.message;
      subOrder.completedAt = Date.now();
      throw error;

    } finally {
      // 从活跃列表移除 / Remove from active list
      iceberg.activeSubOrders.delete(subOrder.subOrderId);
    }
  }

  /**
   * 等待子订单完成
   * Wait for sub-order completion
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @private
   */
  async _waitForSubOrderCompletion(iceberg) {
    // 等待一定时间 / Wait for some time
    await this._sleep(this.config.subOrderInterval);

    // 检查并处理超时的子订单 / Check and handle timed out sub-orders
    const now = Date.now();
    for (const [subOrderId, subOrder] of iceberg.activeSubOrders) {
      if (now - subOrder.createdAt > this.config.subOrderTimeout) {
        // 子订单超时 / Sub-order timeout
        this.log(`子订单超时: ${subOrderId} / Sub-order timeout`, 'warn');

        // 尝试取消 / Try to cancel
        if (this.orderExecutor) {
          try {
            await this.orderExecutor.cancelOrder(subOrderId);
          } catch (error) {
            // 忽略取消错误 / Ignore cancel error
          }
        }

        // 标记为超时 / Mark as timeout
        subOrder.status = 'timeout';
        subOrder.completedAt = now;
        iceberg.activeSubOrders.delete(subOrderId);
      }
    }
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 计算拆单
   * Calculate splits
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {string} strategy - 拆单策略 / Split strategy
   * @param {Object} params - 参数 / Parameters
   * @returns {Array} 拆单列表 / Split list
   * @private
   */
  _calculateSplits(totalSize, strategy, params) {
    const { liquidityInfo = {}, marketCondition = {} } = params;

    switch (strategy) {
      case SPLIT_STRATEGY.FIXED:
        const fixedSize = params.splitSize || totalSize * 0.1;
        return SplitCalculator.fixedSplit(totalSize, fixedSize);

      case SPLIT_STRATEGY.PERCENTAGE:
        const percentage = params.splitPercentage || 0.1;
        return SplitCalculator.percentageSplit(totalSize, percentage);

      case SPLIT_STRATEGY.LIQUIDITY:
        return SplitCalculator.liquiditySplit(totalSize, liquidityInfo);

      case SPLIT_STRATEGY.RANDOM:
        return SplitCalculator.randomSplit(totalSize, 0.1, this.config.randomRange);

      case SPLIT_STRATEGY.ADAPTIVE:
      default:
        return SplitCalculator.adaptiveSplit(totalSize, marketCondition);
    }
  }

  /**
   * 应用显示模式
   * Apply display mode
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {number} size - 原始大小 / Original size
   * @returns {number} 调整后的大小 / Adjusted size
   * @private
   */
  _applyDisplayMode(iceberg, size) {
    switch (iceberg.displayMode) {
      case DISPLAY_MODE.RANDOM:
        // 随机显示量 / Random display size
        const randomFactor = 1 + (Math.random() * 2 - 1) * this.config.randomRange;
        return Math.min(size * randomFactor, iceberg.remainingSize);

      case DISPLAY_MODE.DYNAMIC:
        // 动态显示量（基于流动性）/ Dynamic display size (liquidity-based)
        if (this.orderBookAnalyzer) {
          const orderBook = this.orderBookAnalyzer.getCachedOrderBook(iceberg.symbol);
          if (orderBook) {
            const depth = iceberg.side === 'buy'
              ? orderBook.asks?.slice(0, 5).reduce((sum, [, vol]) => sum + vol, 0)
              : orderBook.bids?.slice(0, 5).reduce((sum, [, vol]) => sum + vol, 0);

            if (depth > 0) {
              // 不超过深度的 5% / Not exceeding 5% of depth
              return Math.min(size, depth * 0.05, iceberg.remainingSize);
            }
          }
        }
        return size;

      case DISPLAY_MODE.FIXED:
      default:
        return Math.min(size, iceberg.displaySize, iceberg.remainingSize);
    }
  }

  /**
   * 应用反检测
   * Apply anti-detection
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {number} size - 原始大小 / Original size
   * @returns {number} 调整后的大小 / Adjusted size
   * @private
   */
  _applyAntiDetection(iceberg, size) {
    const lastSizes = this.lastSubOrderSizes.get(iceberg.icebergId) || [];

    // 检查是否有太多连续相同大小 / Check for too many consecutive same sizes
    const recentSameCount = lastSizes
      .slice(-this.config.maxConsecutiveSameSize)
      .filter(s => Math.abs(s - size) / size < 0.01)
      .length;

    if (recentSameCount >= this.config.maxConsecutiveSameSize) {
      // 强制随机调整 / Force random adjustment
      const adjustment = (Math.random() * 0.4 - 0.2);  // ±20%
      size = size * (1 + adjustment);
    }

    return size;
  }

  /**
   * 记录最后子订单大小
   * Record last sub-order size
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   * @param {number} size - 大小 / Size
   * @private
   */
  _recordLastSubOrderSize(icebergId, size) {
    if (!this.lastSubOrderSizes.has(icebergId)) {
      this.lastSubOrderSizes.set(icebergId, []);
    }

    const sizes = this.lastSubOrderSizes.get(icebergId);
    sizes.push(size);

    // 只保留最近 10 个 / Only keep last 10
    if (sizes.length > 10) {
      sizes.shift();
    }
  }

  /**
   * 计算间隔时间
   * Calculate interval time
   *
   * @returns {number} 间隔时间（毫秒）/ Interval time (ms)
   * @private
   */
  _calculateInterval() {
    const base = this.config.subOrderInterval;
    const random = Math.random() * this.config.intervalRandomRange * 2 - this.config.intervalRandomRange;
    return Math.max(100, base + random);
  }

  /**
   * 检查是否应该在错误时停止
   * Check if should stop on error
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {Error} error - 错误对象 / Error object
   * @returns {boolean} 是否应该停止 / Whether should stop
   * @private
   */
  _shouldStopOnError(iceberg, error) {
    // 计算连续失败次数 / Calculate consecutive failure count
    const recentSubOrders = iceberg.subOrders.slice(-5);
    const failedCount = recentSubOrders.filter(so => so.status === 'failed').length;

    // 如果连续失败 3 次，停止 / If 3 consecutive failures, stop
    if (failedCount >= 3) {
      return true;
    }

    // 检查特定错误类型 / Check specific error types
    const errorMessage = error.message?.toLowerCase() || '';
    if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      return true;  // 余额不足 / Insufficient balance
    }

    return false;
  }

  /**
   * 完成冰山单处理
   * Finalize iceberg order
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @private
   */
  _finalizeIceberg(iceberg) {
    // 计算统计 / Calculate statistics
    const duration = (iceberg.completedAt || Date.now()) - iceberg.startedAt;
    const completionRate = iceberg.executedSize / iceberg.totalSize;

    // 更新全局统计 / Update global statistics
    if (iceberg.status === ICEBERG_STATUS.COMPLETED) {
      this.stats.completedIcebergs++;
    }

    this.stats.totalVolume += iceberg.executedSize;
    this.stats.avgSubOrderSize = this.stats.totalVolume / this.stats.totalSubOrders;

    // 更新平均完成时间 / Update average completion time
    const completedCount = this.stats.completedIcebergs;
    this.stats.avgCompletionTime = (
      (this.stats.avgCompletionTime * (completedCount - 1) + duration) / completedCount
    );

    // 从活跃列表移除 / Remove from active list
    this.activeIcebergs.delete(iceberg.icebergId);

    // 清理最后子订单大小记录 / Clean up last sub-order sizes
    this.lastSubOrderSizes.delete(iceberg.icebergId);

    // 发出完成事件 / Emit completed event
    this.emit('icebergCompleted', {
      iceberg,
      duration,
      completionRate,
    });

    // 记录日志 / Log
    this.log(
      `冰山单完成: ${iceberg.icebergId}, ` +
      `执行 ${iceberg.executedSize}/${iceberg.totalSize} (${(completionRate * 100).toFixed(1)}%), ` +
      `均价 ${iceberg.avgExecutionPrice?.toFixed(2)}, ` +
      `子订单 ${iceberg.subOrders.length} 个, ` +
      `耗时 ${(duration / 1000).toFixed(1)}s / ` +
      `Iceberg completed`,
      'info'
    );
  }

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取冰山单状态
   * Get iceberg status
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   * @returns {Object|null} 状态 / Status
   */
  getIcebergStatus(icebergId) {
    const iceberg = this.activeIcebergs.get(icebergId);
    if (!iceberg) {
      return null;
    }

    return {
      icebergId: iceberg.icebergId,
      status: iceberg.status,
      progress: iceberg.executedSize / iceberg.totalSize,
      executedSize: iceberg.executedSize,
      remainingSize: iceberg.remainingSize,
      avgExecutionPrice: iceberg.avgExecutionPrice,
      subOrdersCount: iceberg.subOrders.length,
      activeSubOrders: iceberg.activeSubOrders.size,
      elapsedTime: Date.now() - iceberg.startedAt,
    };
  }

  /**
   * 获取所有活跃冰山单
   * Get all active iceberg orders
   *
   * @returns {Array} 活跃冰山单列表 / Active iceberg list
   */
  getActiveIcebergs() {
    return Array.from(this.activeIcebergs.values()).map(iceberg =>
      this.getIcebergStatus(iceberg.icebergId)
    );
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeIcebergs: this.activeIcebergs.size,
    };
  }

  /**
   * 休眠
   * Sleep
   *
   * @param {number} ms - 毫秒数 / Milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') {
      return;
    }

    const prefix = '[Iceberg]';
    const fullMessage = `${prefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      default:
        console.log(fullMessage);
    }
  }
}

// 导出拆单计算器 / Export split calculator
export { SplitCalculator };

// 默认导出 / Default export
export default IcebergOrderExecutor;
