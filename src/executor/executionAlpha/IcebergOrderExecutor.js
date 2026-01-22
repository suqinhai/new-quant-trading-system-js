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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 拆单策略类型
 * Split strategy types
 */
export const SPLIT_STRATEGY = { // 导出常量 SPLIT_STRATEGY
  FIXED: 'fixed',           // 固定大小 / Fixed size
  PERCENTAGE: 'percentage', // 百分比 / Percentage
  LIQUIDITY: 'liquidity',   // 基于流动性 / Liquidity based
  ADAPTIVE: 'adaptive',     // 自适应 / Adaptive
  RANDOM: 'random',         // 随机 / Random
}; // 结束代码块

/**
 * 订单显示模式
 * Order display modes
 */
export const DISPLAY_MODE = { // 导出常量 DISPLAY_MODE
  FIXED: 'fixed',           // 固定显示量 / Fixed display size
  RANDOM: 'random',         // 随机显示量 / Random display size
  DYNAMIC: 'dynamic',       // 动态显示量 / Dynamic display size
}; // 结束代码块

/**
 * 冰山单状态
 * Iceberg order status
 */
export const ICEBERG_STATUS = { // 导出常量 ICEBERG_STATUS
  PENDING: 'pending',       // 等待 / Pending
  ACTIVE: 'active',         // 活跃 / Active
  PAUSED: 'paused',         // 暂停 / Paused
  COMPLETED: 'completed',   // 完成 / Completed
  CANCELED: 'canceled',     // 取消 / Canceled
  FAILED: 'failed',         // 失败 / Failed
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = { // 导出常量 DEFAULT_CONFIG
  // 默认显示比例 / Default display ratio
  defaultDisplayRatio: 0.1,  // 默认显示比例

  // 最小显示量（相对于最小交易单位）/ Minimum display size
  minDisplayMultiple: 5, // 最小显示量（相对于最小交易单位）/ Minimum display size

  // 最大显示量（相对于总量）/ Maximum display ratio
  maxDisplayRatio: 0.3,  // 最大显示量（相对于总量）/ Maximum display ratio

  // 随机化范围 / Randomization range
  randomRange: 0.2,  // randomRange

  // 子订单间隔（毫秒）/ Sub-order interval (ms)
  subOrderInterval: 1000, // 子订单间隔（毫秒）/ Sub-order interval (ms)

  // 子订单间隔随机范围（毫秒）/ Sub-order interval random range (ms)
  intervalRandomRange: 500, // 子订单间隔随机范围（毫秒）/ Sub-order interval random range (ms)

  // 最大并发子订单数 / Max concurrent sub-orders
  maxConcurrentOrders: 3, // 最大并发子订单数

  // 子订单超时时间（毫秒）/ Sub-order timeout (ms)
  subOrderTimeout: 30000, // 子订单超时时间（毫秒）/ Sub-order timeout (ms)

  // 价格追踪间隔（毫秒）/ Price tracking interval (ms)
  priceTrackInterval: 500, // 价格追踪间隔（毫秒）/ Price tracking interval (ms)

  // 价格滑动容忍度 / Price sliding tolerance
  priceSlipTolerance: 0.002,  // 价格SlipTolerance

  // 是否启用反检测 / Enable anti-detection
  enableAntiDetection: true, // 启用AntiDetection

  // 反检测：最大连续相同大小订单数 / Anti-detection: max consecutive same-size orders
  maxConsecutiveSameSize: 2, // 反检测：最大连续相同大小订单数

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志
}; // 结束代码块

// ============================================
// 拆单计算器 / Split Calculator
// ============================================

/**
 * 智能拆单计算器
 * Smart split calculator
 */
class SplitCalculator { // 定义类 SplitCalculator
  /**
   * 计算固定大小拆单
   * Calculate fixed size splits
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} splitSize - 每份大小 / Split size
   * @returns {Array} 拆单列表 / Split list
   */
  static fixedSplit(totalSize, splitSize) { // 执行语句
    const splits = []; // 定义常量 splits
    let remaining = totalSize; // 定义变量 remaining

    while (remaining > 0) { // 循环条件 remaining > 0
      const size = Math.min(splitSize, remaining); // 定义常量 size
      splits.push({ size, type: 'fixed' }); // 调用 splits.push
      remaining -= size; // 执行语句
    } // 结束代码块

    return splits; // 返回结果
  } // 结束代码块

  /**
   * 计算百分比拆单
   * Calculate percentage splits
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} percentage - 每份百分比 / Split percentage
   * @returns {Array} 拆单列表 / Split list
   */
  static percentageSplit(totalSize, percentage) { // 执行语句
    const splitSize = totalSize * percentage; // 定义常量 splitSize
    return this.fixedSplit(totalSize, splitSize); // 返回结果
  } // 结束代码块

  /**
   * 基于流动性的智能拆单
   * Liquidity-based smart split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {Object} liquidityInfo - 流动性信息 / Liquidity info
   * @returns {Array} 拆单列表 / Split list
   */
  static liquiditySplit(totalSize, liquidityInfo) { // 执行语句
    const { // 解构赋值
      bidDepth = 0,           // 买盘深度 / Bid depth
      askDepth = 0,           // 卖盘深度 / Ask depth
      spread = 0.001,         // 买卖价差 / Spread
      avgTradeSize = 0,       // 平均成交量 / Average trade size
    } = liquidityInfo; // 执行语句

    // 计算可用流动性 / Calculate available liquidity
    const availableLiquidity = Math.max(bidDepth, askDepth); // 定义常量 availableLiquidity

    // 目标：每个子订单不超过可用流动性的 5% / Target: each sub-order <= 5% of liquidity
    let targetSplitSize = availableLiquidity * 0.05; // 定义变量 targetSplitSize

    // 如果有平均成交量数据，也参考它 / Also consider average trade size if available
    if (avgTradeSize > 0) { // 条件判断 avgTradeSize > 0
      targetSplitSize = Math.min(targetSplitSize, avgTradeSize * 3); // 赋值 targetSplitSize
    } // 结束代码块

    // 根据价差调整：价差越大，拆分越细 / Adjust based on spread: larger spread = finer splits
    if (spread > 0.002) { // 条件判断 spread > 0.002
      targetSplitSize *= 0.7; // 执行语句
    } else if (spread > 0.005) { // 执行语句
      targetSplitSize *= 0.5; // 执行语句
    } // 结束代码块

    // 确保至少拆成 5 份 / Ensure at least 5 splits
    targetSplitSize = Math.min(targetSplitSize, totalSize / 5); // 赋值 targetSplitSize

    // 确保每份不太小 / Ensure each split is not too small
    targetSplitSize = Math.max(targetSplitSize, totalSize / 50); // 赋值 targetSplitSize

    return this.fixedSplit(totalSize, targetSplitSize); // 返回结果
  } // 结束代码块

  /**
   * 自适应拆单
   * Adaptive split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {Object} marketCondition - 市场状况 / Market condition
   * @returns {Array} 拆单列表 / Split list
   */
  static adaptiveSplit(totalSize, marketCondition) { // 执行语句
    const { // 解构赋值
      volatility = 'normal',  // 波动性 / Volatility
      liquidity = 'medium',   // 流动性 / Liquidity
      urgency = 'normal',     // 紧迫性 / Urgency
    } = marketCondition; // 执行语句

    // 基础拆分比例 / Base split ratio
    let splitRatio = 0.1;  // 10%

    // 根据波动性调整 / Adjust based on volatility
    switch (volatility) { // 分支选择 volatility
      case 'high': // 分支 'high'
        splitRatio *= 0.5;  // 高波动：更细的拆分 / High volatility: finer splits
        break; // 跳出循环或分支
      case 'low': // 分支 'low'
        splitRatio *= 1.5;  // 低波动：可以大一些 / Low volatility: can be larger
        break; // 跳出循环或分支
    } // 结束代码块

    // 根据流动性调整 / Adjust based on liquidity
    switch (liquidity) { // 分支选择 liquidity
      case 'high': // 分支 'high'
        splitRatio *= 1.5;  // 高流动性：可以大一些 / High liquidity: can be larger
        break; // 跳出循环或分支
      case 'low': // 分支 'low'
        splitRatio *= 0.5;  // 低流动性：更细的拆分 / Low liquidity: finer splits
        break; // 跳出循环或分支
    } // 结束代码块

    // 根据紧迫性调整 / Adjust based on urgency
    switch (urgency) { // 分支选择 urgency
      case 'high': // 分支 'high'
        splitRatio *= 1.3;  // 紧急：大一些，快点完成 / Urgent: larger, faster completion
        break; // 跳出循环或分支
      case 'low': // 分支 'low'
        splitRatio *= 0.8;  // 不紧急：细一些，减少冲击 / Not urgent: finer, less impact
        break; // 跳出循环或分支
    } // 结束代码块

    // 限制范围 / Limit range
    splitRatio = Math.max(0.02, Math.min(0.3, splitRatio)); // 赋值 splitRatio

    return this.percentageSplit(totalSize, splitRatio); // 返回结果
  } // 结束代码块

  /**
   * 随机拆单
   * Random split
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} avgSplitRatio - 平均拆分比例 / Average split ratio
   * @param {number} randomRange - 随机范围 / Random range
   * @returns {Array} 拆单列表 / Split list
   */
  static randomSplit(totalSize, avgSplitRatio = 0.1, randomRange = 0.3) { // 执行语句
    const splits = []; // 定义常量 splits
    let remaining = totalSize; // 定义变量 remaining
    const avgSize = totalSize * avgSplitRatio; // 定义常量 avgSize

    while (remaining > avgSize * 0.5) { // 循环条件 remaining > avgSize * 0.5
      // 随机生成大小 / Generate random size
      const randomFactor = 1 + (Math.random() * 2 - 1) * randomRange; // 定义常量 randomFactor
      let size = avgSize * randomFactor; // 定义变量 size

      // 确保不超过剩余量 / Ensure not exceeding remaining
      size = Math.min(size, remaining); // 赋值 size

      // 如果剩余量很小，直接全部执行 / If remaining is small, execute all
      if (remaining - size < avgSize * 0.3) { // 条件判断 remaining - size < avgSize * 0.3
        size = remaining; // 赋值 size
      } // 结束代码块

      splits.push({ // 调用 splits.push
        size, // 执行语句
        type: 'random', // 类型
        randomFactor, // 执行语句
      }); // 结束代码块

      remaining -= size; // 执行语句
    } // 结束代码块

    // 处理剩余 / Handle remaining
    if (remaining > 0) { // 条件判断 remaining > 0
      splits.push({ // 调用 splits.push
        size: remaining, // 大小
        type: 'random_remainder', // 类型
      }); // 结束代码块
    } // 结束代码块

    return splits; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 冰山单执行器
 * Iceberg Order Executor
 */
export class IcebergOrderExecutor extends EventEmitter { // 导出类 IcebergOrderExecutor
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 活跃冰山单 / Active iceberg orders
    // 格式: { icebergId: IcebergOrder }
    this.activeIcebergs = new Map(); // 设置 activeIcebergs

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null; // 设置 orderExecutor

    // 盘口分析器引用 / Order book analyzer reference
    this.orderBookAnalyzer = null; // 设置 orderBookAnalyzer

    // 上一个子订单大小（用于反检测）/ Last sub-order size (for anti-detection)
    this.lastSubOrderSizes = new Map(); // 设置 lastSubOrderSizes

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalIcebergs: 0,         // 总冰山单数 / Total iceberg orders
      completedIcebergs: 0,     // 完成数 / Completed
      canceledIcebergs: 0,      // 取消数 / Canceled
      totalSubOrders: 0,        // 总子订单数 / Total sub-orders
      totalVolume: 0,           // 总成交量 / Total volume
      avgSubOrderSize: 0,       // 平均子订单大小 / Average sub-order size
      avgCompletionTime: 0,     // 平均完成时间 / Average completion time
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 初始化 / Initialization
  // ============================================

  /**
   * 初始化执行器
   * Initialize executor
   *
   * @param {Object} dependencies - 依赖项 / Dependencies
   */
  init(dependencies = {}) { // 调用 init
    const { orderExecutor, orderBookAnalyzer } = dependencies; // 解构赋值

    this.orderExecutor = orderExecutor; // 设置 orderExecutor
    this.orderBookAnalyzer = orderBookAnalyzer; // 设置 orderBookAnalyzer

    this.log('冰山单执行器初始化完成 / Iceberg executor initialized', 'info'); // 调用 log
  } // 结束代码块

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
  createIcebergOrder(params) { // 调用 createIcebergOrder
    const { // 解构赋值
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
    } = params; // 执行语句

    // 生成冰山单 ID / Generate iceberg ID
    const icebergId = `iceberg_${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // 定义常量 icebergId

    // 计算显示量 / Calculate display size
    let calculatedDisplaySize = displaySize; // 定义变量 calculatedDisplaySize
    if (!calculatedDisplaySize) { // 条件判断 !calculatedDisplaySize
      calculatedDisplaySize = totalSize * this.config.defaultDisplayRatio; // 赋值 calculatedDisplaySize
    } // 结束代码块

    // 应用显示量限制 / Apply display size limits
    calculatedDisplaySize = Math.min( // 赋值 calculatedDisplaySize
      calculatedDisplaySize, // 执行语句
      totalSize * this.config.maxDisplayRatio // 执行语句
    ); // 结束调用或参数

    // 计算拆单 / Calculate splits
    const splits = this._calculateSplits(totalSize, splitStrategy, params); // 定义常量 splits

    // 创建冰山单对象 / Create iceberg order object
    const iceberg = { // 定义常量 iceberg
      // 基本信息 / Basic info
      icebergId, // 执行语句
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句

      // 数量信息 / Size info
      totalSize, // 执行语句
      displaySize: calculatedDisplaySize, // display大小
      displayMode, // 执行语句
      executedSize: 0, // executed大小
      remainingSize: totalSize, // remaining大小

      // 拆单信息 / Split info
      splitStrategy, // 执行语句
      splits, // 执行语句
      currentSplitIndex: 0, // currentSplitIndex

      // 价格信息 / Price info
      limitPrice, // 执行语句
      priceType, // 执行语句
      avgExecutionPrice: 0, // avgExecution价格
      totalCost: 0, // 总Cost

      // 状态 / Status
      status: ICEBERG_STATUS.PENDING, // 状态

      // 子订单记录 / Sub-order records
      subOrders: [], // sub订单
      activeSubOrders: new Map(), // 活跃Sub订单

      // 时间信息 / Time info
      createdAt: Date.now(), // createdAt
      startedAt: null, // startedAt
      completedAt: null, // completedAt

      // 选项 / Options
      options, // 执行语句
    }; // 结束代码块

    // 保存冰山单 / Save iceberg order
    this.activeIcebergs.set(icebergId, iceberg); // 访问 activeIcebergs

    // 更新统计 / Update stats
    this.stats.totalIcebergs++; // 访问 stats

    // 发出事件 / Emit event
    this.emit('icebergCreated', { iceberg }); // 调用 emit

    // 记录日志 / Log
    this.log( // 调用 log
      `创建冰山单: ${icebergId}, ${symbol} ${side} ${totalSize}, ` + // 执行语句
      `显示量 ${calculatedDisplaySize}, 拆分 ${splits.length} 份 / ` + // 执行语句
      `Created iceberg order`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    return iceberg; // 返回结果
  } // 结束代码块

  /**
   * 启动冰山单执行
   * Start iceberg order execution
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   * @returns {Promise<void>}
   */
  async startIceberg(icebergId) { // 执行语句
    const iceberg = this.activeIcebergs.get(icebergId); // 定义常量 iceberg

    if (!iceberg) { // 条件判断 !iceberg
      throw new Error(`冰山单不存在 / Iceberg not found: ${icebergId}`); // 抛出异常
    } // 结束代码块

    if (iceberg.status !== ICEBERG_STATUS.PENDING && iceberg.status !== ICEBERG_STATUS.PAUSED) { // 条件判断 iceberg.status !== ICEBERG_STATUS.PENDING && ...
      throw new Error(`冰山单状态不允许启动 / Iceberg status does not allow starting: ${iceberg.status}`); // 抛出异常
    } // 结束代码块

    // 更新状态 / Update status
    iceberg.status = ICEBERG_STATUS.ACTIVE; // 赋值 iceberg.status
    iceberg.startedAt = iceberg.startedAt || Date.now(); // 赋值 iceberg.startedAt

    // 发出事件 / Emit event
    this.emit('icebergStarted', { iceberg }); // 调用 emit

    // 记录日志 / Log
    this.log(`启动冰山单: ${icebergId} / Started iceberg: ${icebergId}`, 'info'); // 调用 log

    // 开始执行循环 / Start execution loop
    await this._runIcebergLoop(iceberg); // 等待异步结果
  } // 结束代码块

  /**
   * 暂停冰山单
   * Pause iceberg order
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   */
  pauseIceberg(icebergId) { // 调用 pauseIceberg
    const iceberg = this.activeIcebergs.get(icebergId); // 定义常量 iceberg

    if (!iceberg || iceberg.status !== ICEBERG_STATUS.ACTIVE) { // 条件判断 !iceberg || iceberg.status !== ICEBERG_STATUS...
      return false; // 返回结果
    } // 结束代码块

    iceberg.status = ICEBERG_STATUS.PAUSED; // 赋值 iceberg.status
    this.emit('icebergPaused', { iceberg }); // 调用 emit
    this.log(`暂停冰山单: ${icebergId} / Paused iceberg: ${icebergId}`, 'info'); // 调用 log

    return true; // 返回结果
  } // 结束代码块

  /**
   * 取消冰山单
   * Cancel iceberg order
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   */
  async cancelIceberg(icebergId) { // 执行语句
    const iceberg = this.activeIcebergs.get(icebergId); // 定义常量 iceberg

    if (!iceberg) { // 条件判断 !iceberg
      return false; // 返回结果
    } // 结束代码块

    // 取消所有活跃子订单 / Cancel all active sub-orders
    for (const [subOrderId, subOrder] of iceberg.activeSubOrders) { // 循环 const [subOrderId, subOrder] of iceberg.activ...
      try { // 尝试执行
        if (this.orderExecutor) { // 条件判断 this.orderExecutor
          await this.orderExecutor.cancelOrder(subOrderId); // 等待异步结果
        } // 结束代码块
      } catch (error) { // 执行语句
        this.log(`取消子订单失败: ${error.message} / Failed to cancel sub-order`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 更新状态 / Update status
    iceberg.status = ICEBERG_STATUS.CANCELED; // 赋值 iceberg.status
    iceberg.completedAt = Date.now(); // 赋值 iceberg.completedAt

    // 最终化 / Finalize
    this._finalizeIceberg(iceberg); // 调用 _finalizeIceberg

    // 更新统计 / Update stats
    this.stats.canceledIcebergs++; // 访问 stats

    // 发出事件 / Emit event
    this.emit('icebergCanceled', { iceberg }); // 调用 emit

    // 记录日志 / Log
    this.log( // 调用 log
      `取消冰山单: ${icebergId}, 已执行 ${iceberg.executedSize}/${iceberg.totalSize} / ` + // 执行语句
      `Canceled iceberg`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    return true; // 返回结果
  } // 结束代码块

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
  async _runIcebergLoop(iceberg) { // 执行语句
    while (iceberg.status === ICEBERG_STATUS.ACTIVE) { // 循环条件 iceberg.status === ICEBERG_STATUS.ACTIVE
      // 检查是否还有剩余量 / Check if there's remaining size
      if (iceberg.remainingSize <= 0) { // 条件判断 iceberg.remainingSize <= 0
        iceberg.status = ICEBERG_STATUS.COMPLETED; // 赋值 iceberg.status
        break; // 跳出循环或分支
      } // 结束代码块

      // 检查并发限制 / Check concurrency limit
      if (iceberg.activeSubOrders.size >= this.config.maxConcurrentOrders) { // 条件判断 iceberg.activeSubOrders.size >= this.config.m...
        // 等待一个子订单完成 / Wait for a sub-order to complete
        await this._waitForSubOrderCompletion(iceberg); // 等待异步结果
        continue; // 继续下一轮循环
      } // 结束代码块

      // 计算下一个子订单 / Calculate next sub-order
      const subOrderParams = this._calculateNextSubOrder(iceberg); // 定义常量 subOrderParams

      if (!subOrderParams) { // 条件判断 !subOrderParams
        // 没有更多子订单，等待活跃订单完成 / No more sub-orders, wait for active ones
        if (iceberg.activeSubOrders.size > 0) { // 条件判断 iceberg.activeSubOrders.size > 0
          await this._waitForSubOrderCompletion(iceberg); // 等待异步结果
          continue; // 继续下一轮循环
        } else { // 执行语句
          break; // 跳出循环或分支
        } // 结束代码块
      } // 结束代码块

      // 执行子订单 / Execute sub-order
      try { // 尝试执行
        await this._executeSubOrder(iceberg, subOrderParams); // 等待异步结果
      } catch (error) { // 执行语句
        this.log(`子订单执行失败: ${error.message} / Sub-order execution failed`, 'error'); // 调用 log

        // 检查是否需要停止 / Check if should stop
        if (this._shouldStopOnError(iceberg, error)) { // 条件判断 this._shouldStopOnError(iceberg, error)
          iceberg.status = ICEBERG_STATUS.FAILED; // 赋值 iceberg.status
          iceberg.error = error.message; // 赋值 iceberg.error
          break; // 跳出循环或分支
        } // 结束代码块
      } // 结束代码块

      // 等待间隔 / Wait interval
      const interval = this._calculateInterval(); // 定义常量 interval
      await this._sleep(interval); // 等待异步结果
    } // 结束代码块

    // 等待所有活跃子订单完成 / Wait for all active sub-orders to complete
    while (iceberg.activeSubOrders.size > 0) { // 循环条件 iceberg.activeSubOrders.size > 0
      await this._waitForSubOrderCompletion(iceberg); // 等待异步结果
    } // 结束代码块

    // 完成处理 / Finalize
    if (iceberg.status === ICEBERG_STATUS.ACTIVE) { // 条件判断 iceberg.status === ICEBERG_STATUS.ACTIVE
      iceberg.status = ICEBERG_STATUS.COMPLETED; // 赋值 iceberg.status
    } // 结束代码块
    iceberg.completedAt = Date.now(); // 赋值 iceberg.completedAt

    this._finalizeIceberg(iceberg); // 调用 _finalizeIceberg
  } // 结束代码块

  /**
   * 计算下一个子订单参数
   * Calculate next sub-order parameters
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @returns {Object|null} 子订单参数 / Sub-order parameters
   * @private
   */
  _calculateNextSubOrder(iceberg) { // 调用 _calculateNextSubOrder
    // 检查是否还有拆分 / Check if there are more splits
    if (iceberg.currentSplitIndex >= iceberg.splits.length) { // 条件判断 iceberg.currentSplitIndex >= iceberg.splits.l...
      // 检查是否有剩余量需要处理 / Check if there's remaining size to handle
      if (iceberg.remainingSize > 0) { // 条件判断 iceberg.remainingSize > 0
        // 创建补充子订单 / Create supplementary sub-order
        return { // 返回结果
          size: iceberg.remainingSize, // 大小
          isSupplementary: true, // 是否Supplementary
        }; // 结束代码块
      } // 结束代码块
      return null; // 返回结果
    } // 结束代码块

    // 获取当前拆分 / Get current split
    const split = iceberg.splits[iceberg.currentSplitIndex]; // 定义常量 split

    // 计算实际大小 / Calculate actual size
    let size = Math.min(split.size, iceberg.remainingSize); // 定义变量 size

    // 应用显示模式 / Apply display mode
    size = this._applyDisplayMode(iceberg, size); // 赋值 size

    // 应用反检测 / Apply anti-detection
    if (this.config.enableAntiDetection) { // 条件判断 this.config.enableAntiDetection
      size = this._applyAntiDetection(iceberg, size); // 赋值 size
    } // 结束代码块

    // 确保大小有效 / Ensure size is valid
    if (size <= 0) { // 条件判断 size <= 0
      return null; // 返回结果
    } // 结束代码块

    // 移动到下一个拆分 / Move to next split
    iceberg.currentSplitIndex++; // 执行语句

    return { // 返回结果
      size, // 执行语句
      splitIndex: iceberg.currentSplitIndex - 1, // splitIndex
      originalSplitSize: split.size, // originalSplit大小
    }; // 结束代码块
  } // 结束代码块

  /**
   * 执行子订单
   * Execute sub-order
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {Object} subOrderParams - 子订单参数 / Sub-order parameters
   * @private
   */
  async _executeSubOrder(iceberg, subOrderParams) { // 执行语句
    const { size, splitIndex, isSupplementary } = subOrderParams; // 解构赋值

    // 获取当前价格 / Get current price
    let price = iceberg.limitPrice; // 定义变量 price
    if (!price && this.orderBookAnalyzer) { // 条件判断 !price && this.orderBookAnalyzer
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(iceberg.symbol); // 定义常量 orderBook
      if (orderBook) { // 条件判断 orderBook
        price = iceberg.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid; // 赋值 price
      } // 结束代码块
    } // 结束代码块

    // 创建子订单记录 / Create sub-order record
    const subOrder = { // 定义常量 subOrder
      subOrderId: `${iceberg.icebergId}_sub_${iceberg.subOrders.length}`, // sub订单ID
      size, // 执行语句
      price, // 执行语句
      splitIndex, // 执行语句
      isSupplementary: !!isSupplementary, // 是否Supplementary
      status: 'pending', // 状态
      createdAt: Date.now(), // createdAt
      executedSize: 0, // executed大小
      avgPrice: 0, // avg价格
    }; // 结束代码块

    // 添加到记录 / Add to records
    iceberg.subOrders.push(subOrder); // 调用 iceberg.subOrders.push
    iceberg.activeSubOrders.set(subOrder.subOrderId, subOrder); // 调用 iceberg.activeSubOrders.set

    // 更新统计 / Update stats
    this.stats.totalSubOrders++; // 访问 stats

    try { // 尝试执行
      // 执行订单 / Execute order
      if (this.orderExecutor) { // 条件判断 this.orderExecutor
        const result = await this.orderExecutor.executeSmartLimitOrder({ // 定义常量 result
          exchangeId: iceberg.exchangeId, // 交易所ID
          symbol: iceberg.symbol, // 交易对
          side: iceberg.side, // 方向
          amount: size, // 数量
          price: price, // 价格
          postOnly: false, // 挂单仅
          options: { // options
            icebergId: iceberg.icebergId, // icebergID
            subOrderId: subOrder.subOrderId, // sub订单ID
          }, // 结束代码块
        }); // 结束代码块

        // 更新子订单状态 / Update sub-order status
        subOrder.status = 'completed'; // 赋值 subOrder.status
        subOrder.executedSize = result.orderInfo?.filledAmount || size; // 赋值 subOrder.executedSize
        subOrder.avgPrice = result.orderInfo?.avgPrice || price; // 赋值 subOrder.avgPrice
        subOrder.completedAt = Date.now(); // 赋值 subOrder.completedAt

      } else { // 执行语句
        // 模拟执行 / Simulated execution
        subOrder.status = 'simulated'; // 赋值 subOrder.status
        subOrder.executedSize = size; // 赋值 subOrder.executedSize
        subOrder.avgPrice = price; // 赋值 subOrder.avgPrice
        subOrder.completedAt = Date.now(); // 赋值 subOrder.completedAt
      } // 结束代码块

      // 更新冰山单状态 / Update iceberg status
      iceberg.executedSize += subOrder.executedSize; // 执行语句
      iceberg.remainingSize -= subOrder.executedSize; // 执行语句
      iceberg.totalCost += subOrder.executedSize * subOrder.avgPrice; // 执行语句
      iceberg.avgExecutionPrice = iceberg.totalCost / iceberg.executedSize; // 赋值 iceberg.avgExecutionPrice

      // 记录最后子订单大小（用于反检测）/ Record last sub-order size
      this._recordLastSubOrderSize(iceberg.icebergId, size); // 调用 _recordLastSubOrderSize

      // 发出事件 / Emit event
      this.emit('subOrderCompleted', { // 调用 emit
        iceberg, // 执行语句
        subOrder, // 执行语句
        progress: iceberg.executedSize / iceberg.totalSize, // progress
      }); // 结束代码块

      // 记录日志 / Log
      this.log( // 调用 log
        `子订单完成: ${subOrder.subOrderId}, ` + // 执行语句
        `${subOrder.executedSize} @ ${subOrder.avgPrice?.toFixed(2)}, ` + // 执行语句
        `进度 ${((iceberg.executedSize / iceberg.totalSize) * 100).toFixed(1)}% / ` + // 执行语句
        `Sub-order completed`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      subOrder.status = 'failed'; // 赋值 subOrder.status
      subOrder.error = error.message; // 赋值 subOrder.error
      subOrder.completedAt = Date.now(); // 赋值 subOrder.completedAt
      throw error; // 抛出异常

    } finally { // 执行语句
      // 从活跃列表移除 / Remove from active list
      iceberg.activeSubOrders.delete(subOrder.subOrderId); // 调用 iceberg.activeSubOrders.delete
    } // 结束代码块
  } // 结束代码块

  /**
   * 等待子订单完成
   * Wait for sub-order completion
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @private
   */
  async _waitForSubOrderCompletion(iceberg) { // 执行语句
    // 等待一定时间 / Wait for some time
    await this._sleep(this.config.subOrderInterval); // 等待异步结果

    // 检查并处理超时的子订单 / Check and handle timed out sub-orders
    const now = Date.now(); // 定义常量 now
    for (const [subOrderId, subOrder] of iceberg.activeSubOrders) { // 循环 const [subOrderId, subOrder] of iceberg.activ...
      if (now - subOrder.createdAt > this.config.subOrderTimeout) { // 条件判断 now - subOrder.createdAt > this.config.subOrd...
        // 子订单超时 / Sub-order timeout
        this.log(`子订单超时: ${subOrderId} / Sub-order timeout`, 'warn'); // 调用 log

        // 尝试取消 / Try to cancel
        if (this.orderExecutor) { // 条件判断 this.orderExecutor
          try { // 尝试执行
            await this.orderExecutor.cancelOrder(subOrderId); // 等待异步结果
          } catch (error) { // 执行语句
            // 忽略取消错误 / Ignore cancel error
          } // 结束代码块
        } // 结束代码块

        // 标记为超时 / Mark as timeout
        subOrder.status = 'timeout'; // 赋值 subOrder.status
        subOrder.completedAt = now; // 赋值 subOrder.completedAt
        iceberg.activeSubOrders.delete(subOrderId); // 调用 iceberg.activeSubOrders.delete
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

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
  _calculateSplits(totalSize, strategy, params) { // 调用 _calculateSplits
    const { liquidityInfo = {}, marketCondition = {} } = params; // 解构赋值

    switch (strategy) { // 分支选择 strategy
      case SPLIT_STRATEGY.FIXED: // 分支 SPLIT_STRATEGY.FIXED
        const fixedSize = params.splitSize || totalSize * 0.1; // 定义常量 fixedSize
        return SplitCalculator.fixedSplit(totalSize, fixedSize); // 返回结果

      case SPLIT_STRATEGY.PERCENTAGE: // 分支 SPLIT_STRATEGY.PERCENTAGE
        const percentage = params.splitPercentage || 0.1; // 定义常量 percentage
        return SplitCalculator.percentageSplit(totalSize, percentage); // 返回结果

      case SPLIT_STRATEGY.LIQUIDITY: // 分支 SPLIT_STRATEGY.LIQUIDITY
        return SplitCalculator.liquiditySplit(totalSize, liquidityInfo); // 返回结果

      case SPLIT_STRATEGY.RANDOM: // 分支 SPLIT_STRATEGY.RANDOM
        return SplitCalculator.randomSplit(totalSize, 0.1, this.config.randomRange); // 返回结果

      case SPLIT_STRATEGY.ADAPTIVE: // 分支 SPLIT_STRATEGY.ADAPTIVE
      default: // 默认
        return SplitCalculator.adaptiveSplit(totalSize, marketCondition); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 应用显示模式
   * Apply display mode
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {number} size - 原始大小 / Original size
   * @returns {number} 调整后的大小 / Adjusted size
   * @private
   */
  _applyDisplayMode(iceberg, size) { // 调用 _applyDisplayMode
    switch (iceberg.displayMode) { // 分支选择 iceberg.displayMode
      case DISPLAY_MODE.RANDOM: // 分支 DISPLAY_MODE.RANDOM
        // 随机显示量 / Random display size
        const randomFactor = 1 + (Math.random() * 2 - 1) * this.config.randomRange; // 定义常量 randomFactor
        return Math.min(size * randomFactor, iceberg.remainingSize); // 返回结果

      case DISPLAY_MODE.DYNAMIC: // 分支 DISPLAY_MODE.DYNAMIC
        // 动态显示量（基于流动性）/ Dynamic display size (liquidity-based)
        if (this.orderBookAnalyzer) { // 条件判断 this.orderBookAnalyzer
          const orderBook = this.orderBookAnalyzer.getCachedOrderBook(iceberg.symbol); // 定义常量 orderBook
          if (orderBook) { // 条件判断 orderBook
            const depth = iceberg.side === 'buy' // 定义常量 depth
              ? orderBook.asks?.slice(0, 5).reduce((sum, [, vol]) => sum + vol, 0) // 定义箭头函数
              : orderBook.bids?.slice(0, 5).reduce((sum, [, vol]) => sum + vol, 0); // 定义箭头函数

            if (depth > 0) { // 条件判断 depth > 0
              // 不超过深度的 5% / Not exceeding 5% of depth
              return Math.min(size, depth * 0.05, iceberg.remainingSize); // 返回结果
            } // 结束代码块
          } // 结束代码块
        } // 结束代码块
        return size; // 返回结果

      case DISPLAY_MODE.FIXED: // 分支 DISPLAY_MODE.FIXED
      default: // 默认
        return Math.min(size, iceberg.displaySize, iceberg.remainingSize); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 应用反检测
   * Apply anti-detection
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {number} size - 原始大小 / Original size
   * @returns {number} 调整后的大小 / Adjusted size
   * @private
   */
  _applyAntiDetection(iceberg, size) { // 调用 _applyAntiDetection
    const lastSizes = this.lastSubOrderSizes.get(iceberg.icebergId) || []; // 定义常量 lastSizes

    // 检查是否有太多连续相同大小 / Check for too many consecutive same sizes
    const recentSameCount = lastSizes // 定义常量 recentSameCount
      .slice(-this.config.maxConsecutiveSameSize) // 执行语句
      .filter(s => Math.abs(s - size) / size < 0.01) // 定义箭头函数
      .length; // 执行语句

    if (recentSameCount >= this.config.maxConsecutiveSameSize) { // 条件判断 recentSameCount >= this.config.maxConsecutive...
      // 强制随机调整 / Force random adjustment
      const adjustment = (Math.random() * 0.4 - 0.2);  // ±20%
      size = size * (1 + adjustment); // 赋值 size
    } // 结束代码块

    return size; // 返回结果
  } // 结束代码块

  /**
   * 记录最后子订单大小
   * Record last sub-order size
   *
   * @param {string} icebergId - 冰山单 ID / Iceberg ID
   * @param {number} size - 大小 / Size
   * @private
   */
  _recordLastSubOrderSize(icebergId, size) { // 调用 _recordLastSubOrderSize
    if (!this.lastSubOrderSizes.has(icebergId)) { // 条件判断 !this.lastSubOrderSizes.has(icebergId)
      this.lastSubOrderSizes.set(icebergId, []); // 访问 lastSubOrderSizes
    } // 结束代码块

    const sizes = this.lastSubOrderSizes.get(icebergId); // 定义常量 sizes
    sizes.push(size); // 调用 sizes.push

    // 只保留最近 10 个 / Only keep last 10
    if (sizes.length > 10) { // 条件判断 sizes.length > 10
      sizes.shift(); // 调用 sizes.shift
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算间隔时间
   * Calculate interval time
   *
   * @returns {number} 间隔时间（毫秒）/ Interval time (ms)
   * @private
   */
  _calculateInterval() { // 调用 _calculateInterval
    const base = this.config.subOrderInterval; // 定义常量 base
    const random = Math.random() * this.config.intervalRandomRange * 2 - this.config.intervalRandomRange; // 定义常量 random
    return Math.max(100, base + random); // 返回结果
  } // 结束代码块

  /**
   * 检查是否应该在错误时停止
   * Check if should stop on error
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @param {Error} error - 错误对象 / Error object
   * @returns {boolean} 是否应该停止 / Whether should stop
   * @private
   */
  _shouldStopOnError(iceberg, error) { // 调用 _shouldStopOnError
    // 计算连续失败次数 / Calculate consecutive failure count
    const recentSubOrders = iceberg.subOrders.slice(-5); // 定义常量 recentSubOrders
    const failedCount = recentSubOrders.filter(so => so.status === 'failed').length; // 定义函数 failedCount

    // 如果连续失败 3 次，停止 / If 3 consecutive failures, stop
    if (failedCount >= 3) { // 条件判断 failedCount >= 3
      return true; // 返回结果
    } // 结束代码块

    // 检查特定错误类型 / Check specific error types
    const errorMessage = error.message?.toLowerCase() || ''; // 定义常量 errorMessage
    if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) { // 条件判断 errorMessage.includes('insufficient') || erro...
      return true;  // 余额不足 / Insufficient balance
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 完成冰山单处理
   * Finalize iceberg order
   *
   * @param {Object} iceberg - 冰山单对象 / Iceberg order object
   * @private
   */
  _finalizeIceberg(iceberg) { // 调用 _finalizeIceberg
    // 计算统计 / Calculate statistics
    const duration = (iceberg.completedAt || Date.now()) - iceberg.startedAt; // 定义常量 duration
    const completionRate = iceberg.executedSize / iceberg.totalSize; // 定义常量 completionRate

    // 更新全局统计 / Update global statistics
    if (iceberg.status === ICEBERG_STATUS.COMPLETED) { // 条件判断 iceberg.status === ICEBERG_STATUS.COMPLETED
      this.stats.completedIcebergs++; // 访问 stats
    } // 结束代码块

    this.stats.totalVolume += iceberg.executedSize; // 访问 stats
    this.stats.avgSubOrderSize = this.stats.totalVolume / this.stats.totalSubOrders; // 访问 stats

    // 更新平均完成时间 / Update average completion time
    const completedCount = this.stats.completedIcebergs; // 定义常量 completedCount
    this.stats.avgCompletionTime = ( // 访问 stats
      (this.stats.avgCompletionTime * (completedCount - 1) + duration) / completedCount // 执行语句
    ); // 结束调用或参数

    // 从活跃列表移除 / Remove from active list
    this.activeIcebergs.delete(iceberg.icebergId); // 访问 activeIcebergs

    // 清理最后子订单大小记录 / Clean up last sub-order sizes
    this.lastSubOrderSizes.delete(iceberg.icebergId); // 访问 lastSubOrderSizes

    // 发出完成事件 / Emit completed event
    this.emit('icebergCompleted', { // 调用 emit
      iceberg, // 执行语句
      duration, // 执行语句
      completionRate, // 执行语句
    }); // 结束代码块

    // 记录日志 / Log
    this.log( // 调用 log
      `冰山单完成: ${iceberg.icebergId}, ` + // 执行语句
      `执行 ${iceberg.executedSize}/${iceberg.totalSize} (${(completionRate * 100).toFixed(1)}%), ` + // 执行语句
      `均价 ${iceberg.avgExecutionPrice?.toFixed(2)}, ` + // 执行语句
      `子订单 ${iceberg.subOrders.length} 个, ` + // 执行语句
      `耗时 ${(duration / 1000).toFixed(1)}s / ` + // 执行语句
      `Iceberg completed`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

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
  getIcebergStatus(icebergId) { // 调用 getIcebergStatus
    const iceberg = this.activeIcebergs.get(icebergId); // 定义常量 iceberg
    if (!iceberg) { // 条件判断 !iceberg
      return null; // 返回结果
    } // 结束代码块

    return { // 返回结果
      icebergId: iceberg.icebergId, // icebergID
      status: iceberg.status, // 状态
      progress: iceberg.executedSize / iceberg.totalSize, // progress
      executedSize: iceberg.executedSize, // executed大小
      remainingSize: iceberg.remainingSize, // remaining大小
      avgExecutionPrice: iceberg.avgExecutionPrice, // avgExecution价格
      subOrdersCount: iceberg.subOrders.length, // sub订单数量
      activeSubOrders: iceberg.activeSubOrders.size, // 活跃Sub订单
      elapsedTime: Date.now() - iceberg.startedAt, // elapsed时间
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有活跃冰山单
   * Get all active iceberg orders
   *
   * @returns {Array} 活跃冰山单列表 / Active iceberg list
   */
  getActiveIcebergs() { // 调用 getActiveIcebergs
    return Array.from(this.activeIcebergs.values()).map(iceberg => // 返回结果
      this.getIcebergStatus(iceberg.icebergId) // 调用 getIcebergStatus
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      activeIcebergs: this.activeIcebergs.size, // 活跃Icebergs
    }; // 结束代码块
  } // 结束代码块

  /**
   * 休眠
   * Sleep
   *
   * @param {number} ms - 毫秒数 / Milliseconds
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') { // 条件判断 !this.config.verbose && level === 'info'
      return; // 返回结果
    } // 结束代码块

    const prefix = '[Iceberg]'; // 定义常量 prefix
    const fullMessage = `${prefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      default: // 默认
        console.log(fullMessage); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出拆单计算器 / Export split calculator
export { SplitCalculator }; // 导出命名成员

// 默认导出 / Default export
export default IcebergOrderExecutor; // 默认导出
