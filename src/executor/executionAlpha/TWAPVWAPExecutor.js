/**
 * TWAP/VWAP 动态执行器
 * TWAP/VWAP Dynamic Executor
 *
 * 功能 / Features:
 * 1. TWAP（时间加权平均价格）执行 / TWAP (Time Weighted Average Price) execution
 * 2. VWAP（成交量加权平均价格）执行 / VWAP (Volume Weighted Average Price) execution
 * 3. 动态调整执行节奏 / Dynamic execution pace adjustment
 * 4. 市场状态自适应 / Market condition adaptation
 * 5. 滑点控制与监控 / Slippage control and monitoring
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 执行算法类型
 * Execution algorithm types
 */
export const ALGO_TYPE = { // 导出常量 ALGO_TYPE
  TWAP: 'twap',     // 时间加权 / Time weighted
  VWAP: 'vwap',     // 成交量加权 / Volume weighted
  ADAPTIVE: 'adaptive',  // 自适应 / Adaptive
}; // 结束代码块

/**
 * 执行状态
 * Execution status
 */
export const EXECUTION_STATUS = { // 导出常量 EXECUTION_STATUS
  PENDING: 'pending',         // 等待开始 / Pending
  RUNNING: 'running',         // 执行中 / Running
  PAUSED: 'paused',          // 暂停 / Paused
  COMPLETED: 'completed',     // 已完成 / Completed
  CANCELED: 'canceled',       // 已取消 / Canceled
  FAILED: 'failed',          // 失败 / Failed
}; // 结束代码块

/**
 * 市场状态
 * Market condition
 */
export const MARKET_CONDITION = { // 导出常量 MARKET_CONDITION
  NORMAL: 'normal',           // 正常 / Normal
  VOLATILE: 'volatile',       // 波动 / Volatile
  TRENDING: 'trending',       // 趋势 / Trending
  LOW_LIQUIDITY: 'low_liquidity',  // 低流动性 / Low liquidity
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = { // 导出常量 DEFAULT_CONFIG
  // 默认执行时间（毫秒）/ Default execution duration (ms)
  defaultDuration: 30 * 60 * 1000,  // 30 分钟 / 30 minutes

  // 最小切片间隔（毫秒）/ Minimum slice interval (ms)
  minSliceInterval: 5000,  // 5 秒 / 5 seconds

  // 最大切片间隔（毫秒）/ Maximum slice interval (ms)
  maxSliceInterval: 60000,  // 1 分钟 / 1 minute

  // 切片数量 / Number of slices
  defaultSlices: 20, // 设置 defaultSlices 字段

  // 最大滑点容忍度 / Maximum slippage tolerance
  maxSlippage: 0.005,  // 0.5%

  // 价格偏离暂停阈值 / Price deviation pause threshold
  priceDeviationPause: 0.02,  // 2%

  // 紧急停止阈值 / Emergency stop threshold
  emergencyStopThreshold: 0.05,  // 5%

  // 参与率上限（相对于市场成交量）/ Participation rate limit
  maxParticipationRate: 0.1,  // 10%

  // 是否启用动态调整 / Enable dynamic adjustment
  enableDynamicAdjustment: true, // 设置 enableDynamicAdjustment 字段

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段
}; // 结束代码块

/**
 * 预设的成交量分布曲线（按小时）
 * Preset volume distribution curves (by hour)
 */
export const VOLUME_CURVES = { // 导出常量 VOLUME_CURVES
  // 加密货币24小时分布（基于历史数据）/ Crypto 24h distribution
  crypto: [ // 设置 crypto 字段
    0.032, 0.028, 0.025, 0.024, 0.026, 0.032,  // 00:00 - 05:00
    0.042, 0.055, 0.062, 0.058, 0.052, 0.048,  // 06:00 - 11:00
    0.045, 0.048, 0.055, 0.062, 0.058, 0.052,  // 12:00 - 17:00
    0.048, 0.045, 0.042, 0.038, 0.035, 0.033,  // 18:00 - 23:00
  ], // 结束数组或索引

  // 美股交易时段分布 / US stock trading hours distribution
  usStock: [ // 设置 usStock 字段
    0, 0, 0, 0, 0, 0,                          // 00:00 - 05:00 (休市)
    0, 0, 0, 0.12, 0.10, 0.08,                 // 06:00 - 11:00 (09:30 开盘)
    0.07, 0.06, 0.06, 0.08, 0.10, 0,           // 12:00 - 17:00 (16:00 收盘)
    0, 0, 0, 0, 0, 0,                          // 18:00 - 23:00 (休市)
  ], // 结束数组或索引

  // 均匀分布 / Uniform distribution
  uniform: Array(24).fill(1 / 24), // 设置 uniform 字段
}; // 结束代码块

// ============================================
// 切片生成器 / Slice Generator
// ============================================

/**
 * 执行切片生成器
 * Execution slice generator
 */
class SliceGenerator { // 定义类 SliceGenerator
  /**
   * 生成 TWAP 切片
   * Generate TWAP slices
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} sliceCount - 切片数 / Slice count
   * @param {number} duration - 执行时长（毫秒）/ Duration (ms)
   * @returns {Array} 切片列表 / Slice list
   */
  static generateTWAPSlices(totalSize, sliceCount, duration) { // 执行语句
    const slices = []; // 定义常量 slices
    const sliceSize = totalSize / sliceCount; // 定义常量 sliceSize
    const interval = duration / sliceCount; // 定义常量 interval

    for (let i = 0; i < sliceCount; i++) { // 循环 let i = 0; i < sliceCount; i++
      slices.push({ // 调用 slices.push
        index: i, // 设置 index 字段
        size: sliceSize, // 设置 size 字段
        scheduledTime: i * interval, // 设置 scheduledTime 字段
        weight: 1 / sliceCount, // 设置 weight 字段
      }); // 结束代码块
    } // 结束代码块

    return slices; // 返回结果
  } // 结束代码块

  /**
   * 生成 VWAP 切片
   * Generate VWAP slices
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} sliceCount - 切片数 / Slice count
   * @param {number} duration - 执行时长（毫秒）/ Duration (ms)
   * @param {Array} volumeCurve - 成交量曲线 / Volume curve
   * @param {Date} startTime - 开始时间 / Start time
   * @returns {Array} 切片列表 / Slice list
   */
  static generateVWAPSlices(totalSize, sliceCount, duration, volumeCurve, startTime) { // 执行语句
    const slices = []; // 定义常量 slices
    const interval = duration / sliceCount; // 定义常量 interval

    // 计算每个切片对应的成交量权重 / Calculate volume weight for each slice
    const weights = []; // 定义常量 weights
    let totalWeight = 0; // 定义变量 totalWeight

    for (let i = 0; i < sliceCount; i++) { // 循环 let i = 0; i < sliceCount; i++
      // 计算切片对应的时间点 / Calculate time point for slice
      const sliceTime = new Date(startTime.getTime() + i * interval); // 定义常量 sliceTime
      const hour = sliceTime.getUTCHours(); // 定义常量 hour

      // 获取该时段的成交量权重 / Get volume weight for this hour
      const hourWeight = volumeCurve[hour] || (1 / 24); // 定义常量 hourWeight
      weights.push(hourWeight); // 调用 weights.push
      totalWeight += hourWeight; // 执行语句
    } // 结束代码块

    // 归一化权重并生成切片 / Normalize weights and generate slices
    for (let i = 0; i < sliceCount; i++) { // 循环 let i = 0; i < sliceCount; i++
      const normalizedWeight = weights[i] / totalWeight; // 定义常量 normalizedWeight
      slices.push({ // 调用 slices.push
        index: i, // 设置 index 字段
        size: totalSize * normalizedWeight, // 设置 size 字段
        scheduledTime: i * interval, // 设置 scheduledTime 字段
        weight: normalizedWeight, // 设置 weight 字段
        hour: new Date(startTime.getTime() + i * interval).getUTCHours(), // 设置 hour 字段
      }); // 结束代码块
    } // 结束代码块

    return slices; // 返回结果
  } // 结束代码块

  /**
   * 生成自适应切片
   * Generate adaptive slices
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} sliceCount - 切片数 / Slice count
   * @param {number} duration - 执行时长（毫秒）/ Duration (ms)
   * @param {Object} marketData - 市场数据 / Market data
   * @returns {Array} 切片列表 / Slice list
   */
  static generateAdaptiveSlices(totalSize, sliceCount, duration, marketData) { // 执行语句
    const { // 解构赋值
      volatility = 0.02,      // 波动率 / Volatility
      liquidity = 'medium',   // 流动性 / Liquidity
      trend = 'neutral',      // 趋势 / Trend
    } = marketData; // 执行语句

    // 根据市场状态调整切片策略 / Adjust slice strategy based on market condition
    let sizeMultipliers = Array(sliceCount).fill(1); // 定义变量 sizeMultipliers

    // 高波动时：前轻后重 / High volatility: light early, heavy late
    if (volatility > 0.03) { // 条件判断 volatility > 0.03
      sizeMultipliers = sizeMultipliers.map((_, i) => 0.5 + (i / sliceCount)); // 赋值 sizeMultipliers
    } // 结束代码块

    // 低流动性：更均匀分布 / Low liquidity: more uniform distribution
    if (liquidity === 'low') { // 条件判断 liquidity === 'low'
      sizeMultipliers = Array(sliceCount).fill(1); // 赋值 sizeMultipliers
    } // 结束代码块

    // 强趋势：加快执行 / Strong trend: accelerate execution
    if (trend === 'strong_up' || trend === 'strong_down') { // 条件判断 trend === 'strong_up' || trend === 'strong_down'
      sizeMultipliers = sizeMultipliers.map((_, i) => 1.5 - (i / sliceCount) * 0.8); // 赋值 sizeMultipliers
    } // 结束代码块

    // 归一化并生成切片 / Normalize and generate slices
    const totalMultiplier = sizeMultipliers.reduce((a, b) => a + b, 0); // 定义函数 totalMultiplier
    const slices = []; // 定义常量 slices

    for (let i = 0; i < sliceCount; i++) { // 循环 let i = 0; i < sliceCount; i++
      const weight = sizeMultipliers[i] / totalMultiplier; // 定义常量 weight
      slices.push({ // 调用 slices.push
        index: i, // 设置 index 字段
        size: totalSize * weight, // 设置 size 字段
        scheduledTime: i * (duration / sliceCount), // 设置 scheduledTime 字段
        weight, // 执行语句
        adaptiveFactors: { // 设置 adaptiveFactors 字段
          volatility, // 执行语句
          liquidity, // 执行语句
          trend, // 执行语句
        }, // 结束代码块
      }); // 结束代码块
    } // 结束代码块

    return slices; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * TWAP/VWAP 执行器
 * TWAP/VWAP Executor
 */
export class TWAPVWAPExecutor extends EventEmitter { // 导出类 TWAPVWAPExecutor
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

    // 活跃执行任务 / Active execution tasks
    // 格式: { taskId: ExecutionTask }
    this.activeTasks = new Map(); // 设置 activeTasks

    // 历史执行记录 / Historical execution records
    this.executionHistory = []; // 设置 executionHistory

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null; // 设置 orderExecutor

    // 盘口分析器引用 / Order book analyzer reference
    this.orderBookAnalyzer = null; // 设置 orderBookAnalyzer

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalTasks: 0,            // 总任务数 / Total tasks
      completedTasks: 0,        // 完成任务数 / Completed tasks
      canceledTasks: 0,         // 取消任务数 / Canceled tasks
      totalVolume: 0,           // 总成交量 / Total volume
      totalSlippage: 0,         // 总滑点 / Total slippage
      avgSlippage: 0,           // 平均滑点 / Average slippage
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

    this.log('TWAP/VWAP 执行器初始化完成 / TWAP/VWAP executor initialized', 'info'); // 调用 log
  } // 结束代码块

  // ============================================
  // 核心执行方法 / Core Execution Methods
  // ============================================

  /**
   * 创建 TWAP 执行任务
   * Create TWAP execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   */
  createTWAPTask(params) { // 调用 createTWAPTask
    return this._createExecutionTask({ // 返回结果
      ...params, // 展开对象或数组
      algoType: ALGO_TYPE.TWAP, // 设置 algoType 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 创建 VWAP 执行任务
   * Create VWAP execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   */
  createVWAPTask(params) { // 调用 createVWAPTask
    return this._createExecutionTask({ // 返回结果
      ...params, // 展开对象或数组
      algoType: ALGO_TYPE.VWAP, // 设置 algoType 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 创建自适应执行任务
   * Create adaptive execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   */
  createAdaptiveTask(params) { // 调用 createAdaptiveTask
    return this._createExecutionTask({ // 返回结果
      ...params, // 展开对象或数组
      algoType: ALGO_TYPE.ADAPTIVE, // 设置 algoType 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 创建执行任务
   * Create execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   * @private
   */
  _createExecutionTask(params) { // 调用 _createExecutionTask
    const { // 解构赋值
      exchangeId,                                    // 交易所 ID / Exchange ID
      symbol,                                        // 交易对 / Symbol
      side,                                          // 方向 / Side
      totalSize,                                     // 总量 / Total size
      algoType = ALGO_TYPE.TWAP,                     // 算法类型 / Algorithm type
      duration = this.config.defaultDuration,        // 执行时长 / Duration
      sliceCount = this.config.defaultSlices,        // 切片数 / Slice count
      startTime = new Date(),                        // 开始时间 / Start time
      volumeCurve = VOLUME_CURVES.crypto,            // 成交量曲线 / Volume curve
      maxSlippage = this.config.maxSlippage,         // 最大滑点 / Max slippage
      limitPrice = null,                             // 限价 / Limit price
      marketData = {},                               // 市场数据 / Market data
      options = {},                                  // 额外选项 / Extra options
    } = params; // 执行语句

    // 生成任务 ID / Generate task ID
    const taskId = `${algoType}_${symbol}_${Date.now()}`; // 定义常量 taskId

    // 生成执行切片 / Generate execution slices
    let slices; // 定义变量 slices
    switch (algoType) { // 分支选择 algoType
      case ALGO_TYPE.VWAP: // 分支 ALGO_TYPE.VWAP
        slices = SliceGenerator.generateVWAPSlices( // 赋值 slices
          totalSize, sliceCount, duration, volumeCurve, startTime // 执行语句
        ); // 结束调用或参数
        break; // 跳出循环或分支

      case ALGO_TYPE.ADAPTIVE: // 分支 ALGO_TYPE.ADAPTIVE
        slices = SliceGenerator.generateAdaptiveSlices( // 赋值 slices
          totalSize, sliceCount, duration, marketData // 执行语句
        ); // 结束调用或参数
        break; // 跳出循环或分支

      case ALGO_TYPE.TWAP: // 分支 ALGO_TYPE.TWAP
      default: // 默认分支
        slices = SliceGenerator.generateTWAPSlices(totalSize, sliceCount, duration); // 赋值 slices
        break; // 跳出循环或分支
    } // 结束代码块

    // 创建任务对象 / Create task object
    const task = { // 定义常量 task
      // 基本信息 / Basic info
      taskId, // 执行语句
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      algoType, // 执行语句

      // 数量信息 / Size info
      totalSize, // 执行语句
      executedSize: 0, // 设置 executedSize 字段
      remainingSize: totalSize, // 设置 remainingSize 字段

      // 时间信息 / Time info
      duration, // 执行语句
      startTime: startTime.getTime(), // 设置 startTime 字段
      endTime: startTime.getTime() + duration, // 设置 endTime 字段
      createdAt: Date.now(), // 设置 createdAt 字段

      // 切片信息 / Slice info
      slices, // 执行语句
      currentSliceIndex: 0, // 设置 currentSliceIndex 字段

      // 价格信息 / Price info
      limitPrice, // 执行语句
      maxSlippage, // 执行语句
      benchmarkPrice: null,  // 基准价格（执行开始时的价格）/ Benchmark price
      avgExecutionPrice: 0,  // 平均成交价 / Average execution price
      totalCost: 0,          // 总成本 / Total cost

      // 状态 / Status
      status: EXECUTION_STATUS.PENDING, // 设置 status 字段

      // 执行记录 / Execution records
      executionRecords: [], // 设置 executionRecords 字段

      // 动态调整参数 / Dynamic adjustment params
      adjustmentHistory: [], // 设置 adjustmentHistory 字段
      currentParticipationRate: 0, // 设置 currentParticipationRate 字段

      // 选项 / Options
      options, // 执行语句
    }; // 结束代码块

    // 保存任务 / Save task
    this.activeTasks.set(taskId, task); // 访问 activeTasks

    // 更新统计 / Update stats
    this.stats.totalTasks++; // 访问 stats

    // 发出事件 / Emit event
    this.emit('taskCreated', { task }); // 调用 emit

    // 记录日志 / Log
    this.log( // 调用 log
      `创建 ${algoType.toUpperCase()} 任务: ${taskId}, ` + // 执行语句
      `${symbol} ${side} ${totalSize}, 时长 ${duration / 1000}s / ` + // 执行语句
      `Created ${algoType.toUpperCase()} task`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    return task; // 返回结果
  } // 结束代码块

  /**
   * 启动执行任务
   * Start execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   * @returns {Promise<void>}
   */
  async startTask(taskId) { // 执行语句
    // 获取任务 / Get task
    const task = this.activeTasks.get(taskId); // 定义常量 task

    if (!task) { // 条件判断 !task
      throw new Error(`任务不存在 / Task not found: ${taskId}`); // 抛出异常
    } // 结束代码块

    if (task.status !== EXECUTION_STATUS.PENDING && task.status !== EXECUTION_STATUS.PAUSED) { // 条件判断 task.status !== EXECUTION_STATUS.PENDING && t...
      throw new Error(`任务状态不允许启动 / Task status does not allow starting: ${task.status}`); // 抛出异常
    } // 结束代码块

    // 设置基准价格 / Set benchmark price
    if (!task.benchmarkPrice && this.orderBookAnalyzer) { // 条件判断 !task.benchmarkPrice && this.orderBookAnalyzer
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol); // 定义常量 orderBook
      if (orderBook) { // 条件判断 orderBook
        task.benchmarkPrice = task.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid; // 赋值 task.benchmarkPrice
      } // 结束代码块
    } // 结束代码块

    // 更新状态 / Update status
    task.status = EXECUTION_STATUS.RUNNING; // 赋值 task.status

    // 发出事件 / Emit event
    this.emit('taskStarted', { task }); // 调用 emit

    // 记录日志 / Log
    this.log(`启动任务: ${taskId} / Started task: ${taskId}`, 'info'); // 调用 log

    // 开始执行循环 / Start execution loop
    await this._runExecutionLoop(task); // 等待异步结果
  } // 结束代码块

  /**
   * 暂停执行任务
   * Pause execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   */
  pauseTask(taskId) { // 调用 pauseTask
    const task = this.activeTasks.get(taskId); // 定义常量 task

    if (!task || task.status !== EXECUTION_STATUS.RUNNING) { // 条件判断 !task || task.status !== EXECUTION_STATUS.RUN...
      return false; // 返回结果
    } // 结束代码块

    task.status = EXECUTION_STATUS.PAUSED; // 赋值 task.status
    this.emit('taskPaused', { task }); // 调用 emit
    this.log(`暂停任务: ${taskId} / Paused task: ${taskId}`, 'info'); // 调用 log

    return true; // 返回结果
  } // 结束代码块

  /**
   * 取消执行任务
   * Cancel execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   */
  cancelTask(taskId) { // 调用 cancelTask
    const task = this.activeTasks.get(taskId); // 定义常量 task

    if (!task) { // 条件判断 !task
      return false; // 返回结果
    } // 结束代码块

    // 更新状态 / Update status
    task.status = EXECUTION_STATUS.CANCELED; // 赋值 task.status
    task.canceledAt = Date.now(); // 赋值 task.canceledAt

    // 计算最终统计 / Calculate final statistics
    this._finalizeTask(task); // 调用 _finalizeTask

    // 更新统计 / Update stats
    this.stats.canceledTasks++; // 访问 stats

    // 发出事件 / Emit event
    this.emit('taskCanceled', { task }); // 调用 emit

    // 记录日志 / Log
    this.log( // 调用 log
      `取消任务: ${taskId}, 已执行 ${task.executedSize}/${task.totalSize} / ` + // 执行语句
      `Canceled task: ${taskId}, executed ${task.executedSize}/${task.totalSize}`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    return true; // 返回结果
  } // 结束代码块

  // ============================================
  // 执行循环 / Execution Loop
  // ============================================

  /**
   * 运行执行循环
   * Run execution loop
   *
   * @param {Object} task - 执行任务 / Execution task
   * @private
   */
  async _runExecutionLoop(task) { // 执行语句
    while (task.status === EXECUTION_STATUS.RUNNING) { // 循环条件 task.status === EXECUTION_STATUS.RUNNING
      // 检查是否还有剩余量 / Check if there's remaining size
      if (task.remainingSize <= 0) { // 条件判断 task.remainingSize <= 0
        task.status = EXECUTION_STATUS.COMPLETED; // 赋值 task.status
        break; // 跳出循环或分支
      } // 结束代码块

      // 检查是否超时 / Check if timed out
      if (Date.now() > task.endTime) { // 条件判断 Date.now() > task.endTime
        this.log(`任务超时: ${task.taskId} / Task timed out: ${task.taskId}`, 'warn'); // 调用 log
        // 继续执行剩余量（加速模式）/ Continue executing remaining (accelerated mode)
        if (task.remainingSize > task.totalSize * 0.1) { // 条件判断 task.remainingSize > task.totalSize * 0.1
          // 剩余超过10%，警告但继续 / Remaining > 10%, warn but continue
          this.emit('taskOvertime', { task }); // 调用 emit
        } // 结束代码块
      } // 结束代码块

      // 获取当前切片 / Get current slice
      const currentSlice = task.slices[task.currentSliceIndex]; // 定义常量 currentSlice

      if (!currentSlice) { // 条件判断 !currentSlice
        // 没有更多切片，但还有剩余量 / No more slices but remaining size
        // 创建最后一个补充切片 / Create final supplementary slice
        await this._executeSupplementarySlice(task); // 等待异步结果
        break; // 跳出循环或分支
      } // 结束代码块

      // 检查是否到达切片执行时间 / Check if slice execution time reached
      const elapsedTime = Date.now() - task.startTime; // 定义常量 elapsedTime
      if (elapsedTime < currentSlice.scheduledTime) { // 条件判断 elapsedTime < currentSlice.scheduledTime
        // 还没到时间，等待 / Not yet time, wait
        const waitTime = Math.min( // 定义常量 waitTime
          currentSlice.scheduledTime - elapsedTime, // 执行语句
          this.config.maxSliceInterval // 访问 config
        ); // 结束调用或参数
        await this._sleep(waitTime); // 等待异步结果
        continue; // 继续下一轮循环
      } // 结束代码块

      // 动态调整切片大小 / Dynamically adjust slice size
      const adjustedSlice = this.config.enableDynamicAdjustment // 定义常量 adjustedSlice
        ? await this._adjustSlice(task, currentSlice) // 执行语句
        : currentSlice; // 执行语句

      // 执行切片 / Execute slice
      try { // 尝试执行
        await this._executeSlice(task, adjustedSlice); // 等待异步结果
      } catch (error) { // 执行语句
        this.log(`切片执行失败: ${error.message} / Slice execution failed`, 'error'); // 调用 log

        // 检查是否需要紧急停止 / Check if emergency stop needed
        if (this._checkEmergencyStop(task)) { // 条件判断 this._checkEmergencyStop(task)
          task.status = EXECUTION_STATUS.FAILED; // 赋值 task.status
          task.error = error.message; // 赋值 task.error
          break; // 跳出循环或分支
        } // 结束代码块
      } // 结束代码块

      // 移动到下一个切片 / Move to next slice
      task.currentSliceIndex++; // 执行语句

      // 短暂延迟，避免过于频繁 / Short delay to avoid too frequent
      await this._sleep(this.config.minSliceInterval); // 等待异步结果
    } // 结束代码块

    // 完成任务处理 / Finalize task
    if (task.status === EXECUTION_STATUS.RUNNING) { // 条件判断 task.status === EXECUTION_STATUS.RUNNING
      task.status = EXECUTION_STATUS.COMPLETED; // 赋值 task.status
    } // 结束代码块

    this._finalizeTask(task); // 调用 _finalizeTask
  } // 结束代码块

  /**
   * 执行单个切片
   * Execute single slice
   *
   * @param {Object} task - 执行任务 / Execution task
   * @param {Object} slice - 切片 / Slice
   * @private
   */
  async _executeSlice(task, slice) { // 执行语句
    // 计算实际执行量（不超过剩余量）/ Calculate actual execution size
    const executeSize = Math.min(slice.size, task.remainingSize); // 定义常量 executeSize

    if (executeSize <= 0) { // 条件判断 executeSize <= 0
      return; // 返回结果
    } // 结束代码块

    // 获取当前市场价格 / Get current market price
    let currentPrice = null; // 定义变量 currentPrice
    if (this.orderBookAnalyzer) { // 条件判断 this.orderBookAnalyzer
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol); // 定义常量 orderBook
      if (orderBook) { // 条件判断 orderBook
        currentPrice = task.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid; // 赋值 currentPrice
      } // 结束代码块
    } // 结束代码块

    // 检查价格偏离 / Check price deviation
    if (task.benchmarkPrice && currentPrice) { // 条件判断 task.benchmarkPrice && currentPrice
      const deviation = Math.abs(currentPrice - task.benchmarkPrice) / task.benchmarkPrice; // 定义常量 deviation

      if (deviation > this.config.priceDeviationPause) { // 条件判断 deviation > this.config.priceDeviationPause
        this.log( // 调用 log
          `价格偏离 ${(deviation * 100).toFixed(2)}%，暂停执行 / ` + // 执行语句
          `Price deviation ${(deviation * 100).toFixed(2)}%, pausing`, // 执行语句
          'warn' // 执行语句
        ); // 结束调用或参数
        this.emit('priceDeviation', { task, deviation, currentPrice }); // 调用 emit

        // 等待一个切片间隔后重试 / Wait one slice interval before retry
        await this._sleep(task.duration / task.slices.length); // 等待异步结果
        return; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 检查限价约束 / Check limit price constraint
    if (task.limitPrice) { // 条件判断 task.limitPrice
      const priceOk = task.side === 'buy' // 定义常量 priceOk
        ? currentPrice <= task.limitPrice // 执行语句
        : currentPrice >= task.limitPrice; // 执行语句

      if (!priceOk) { // 条件判断 !priceOk
        this.log( // 调用 log
          `当前价格 ${currentPrice} 不满足限价 ${task.limitPrice}，跳过切片 / ` + // 执行语句
          `Current price ${currentPrice} does not meet limit ${task.limitPrice}, skipping`, // 执行语句
          'info' // 执行语句
        ); // 结束调用或参数
        return; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 记录执行开始 / Record execution start
    const executionRecord = { // 定义常量 executionRecord
      sliceIndex: slice.index, // 设置 sliceIndex 字段
      plannedSize: slice.size, // 设置 plannedSize 字段
      actualSize: executeSize, // 设置 actualSize 字段
      startTime: Date.now(), // 设置 startTime 字段
      startPrice: currentPrice, // 设置 startPrice 字段
      endPrice: null, // 设置 endPrice 字段
      avgPrice: null, // 设置 avgPrice 字段
      slippage: null, // 设置 slippage 字段
      status: 'pending', // 设置 status 字段
    }; // 结束代码块

    // 执行订单 / Execute order
    try { // 尝试执行
      if (this.orderExecutor) { // 条件判断 this.orderExecutor
        // 使用订单执行器 / Use order executor
        const result = await this.orderExecutor.executeSmartLimitOrder({ // 定义常量 result
          exchangeId: task.exchangeId, // 设置 exchangeId 字段
          symbol: task.symbol, // 设置 symbol 字段
          side: task.side, // 设置 side 字段
          amount: executeSize, // 设置 amount 字段
          price: currentPrice, // 设置 price 字段
          postOnly: false,  // TWAP/VWAP 通常需要尽快成交 / TWAP/VWAP usually needs quick execution
          options: { // 设置 options 字段
            taskId: task.taskId, // 设置 taskId 字段
            sliceIndex: slice.index, // 设置 sliceIndex 字段
          }, // 结束代码块
        }); // 结束代码块

        // 更新执行记录 / Update execution record
        executionRecord.endTime = Date.now(); // 赋值 executionRecord.endTime
        executionRecord.avgPrice = result.orderInfo?.avgPrice || currentPrice; // 赋值 executionRecord.avgPrice
        executionRecord.filledSize = result.orderInfo?.filledAmount || executeSize; // 赋值 executionRecord.filledSize
        executionRecord.status = 'completed'; // 赋值 executionRecord.status

      } else { // 执行语句
        // 模拟执行（用于测试）/ Simulated execution (for testing)
        executionRecord.endTime = Date.now(); // 赋值 executionRecord.endTime
        executionRecord.avgPrice = currentPrice; // 赋值 executionRecord.avgPrice
        executionRecord.filledSize = executeSize; // 赋值 executionRecord.filledSize
        executionRecord.status = 'simulated'; // 赋值 executionRecord.status
      } // 结束代码块

      // 计算滑点 / Calculate slippage
      if (task.benchmarkPrice && executionRecord.avgPrice) { // 条件判断 task.benchmarkPrice && executionRecord.avgPrice
        executionRecord.slippage = task.side === 'buy' // 赋值 executionRecord.slippage
          ? (executionRecord.avgPrice - task.benchmarkPrice) / task.benchmarkPrice // 执行语句
          : (task.benchmarkPrice - executionRecord.avgPrice) / task.benchmarkPrice; // 执行语句
      } // 结束代码块

      // 更新任务状态 / Update task status
      const filledSize = executionRecord.filledSize || executeSize; // 定义常量 filledSize
      task.executedSize += filledSize; // 执行语句
      task.remainingSize -= filledSize; // 执行语句
      task.totalCost += filledSize * (executionRecord.avgPrice || currentPrice); // 执行语句
      task.avgExecutionPrice = task.totalCost / task.executedSize; // 赋值 task.avgExecutionPrice

      // 保存执行记录 / Save execution record
      task.executionRecords.push(executionRecord); // 调用 task.executionRecords.push

      // 发出事件 / Emit event
      this.emit('sliceExecuted', { // 调用 emit
        task, // 执行语句
        slice, // 执行语句
        executionRecord, // 执行语句
        progress: task.executedSize / task.totalSize, // 设置 progress 字段
      }); // 结束代码块

      // 记录日志 / Log
      this.log( // 调用 log
        `执行切片 ${slice.index + 1}/${task.slices.length}: ` + // 执行语句
        `${filledSize.toFixed(4)} @ ${executionRecord.avgPrice?.toFixed(2)}, ` + // 执行语句
        `进度 ${((task.executedSize / task.totalSize) * 100).toFixed(1)}% / ` + // 执行语句
        `Executed slice`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      executionRecord.status = 'failed'; // 赋值 executionRecord.status
      executionRecord.error = error.message; // 赋值 executionRecord.error
      executionRecord.endTime = Date.now(); // 赋值 executionRecord.endTime
      task.executionRecords.push(executionRecord); // 调用 task.executionRecords.push

      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行补充切片（处理剩余量）
   * Execute supplementary slice (handle remaining size)
   *
   * @param {Object} task - 执行任务 / Execution task
   * @private
   */
  async _executeSupplementarySlice(task) { // 执行语句
    if (task.remainingSize <= 0) { // 条件判断 task.remainingSize <= 0
      return; // 返回结果
    } // 结束代码块

    this.log( // 调用 log
      `执行补充切片，剩余量 ${task.remainingSize} / ` + // 执行语句
      `Executing supplementary slice, remaining ${task.remainingSize}`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    // 创建补充切片 / Create supplementary slice
    const supplementarySlice = { // 定义常量 supplementarySlice
      index: task.slices.length, // 设置 index 字段
      size: task.remainingSize, // 设置 size 字段
      scheduledTime: Date.now() - task.startTime, // 设置 scheduledTime 字段
      weight: task.remainingSize / task.totalSize, // 设置 weight 字段
      isSupplementary: true, // 设置 isSupplementary 字段
    }; // 结束代码块

    await this._executeSlice(task, supplementarySlice); // 等待异步结果
  } // 结束代码块

  /**
   * 动态调整切片
   * Dynamically adjust slice
   *
   * @param {Object} task - 执行任务 / Execution task
   * @param {Object} slice - 原始切片 / Original slice
   * @returns {Object} 调整后的切片 / Adjusted slice
   * @private
   */
  async _adjustSlice(task, slice) { // 执行语句
    // 获取市场状态 / Get market condition
    const marketCondition = await this._assessMarketCondition(task); // 定义常量 marketCondition

    // 计算调整因子 / Calculate adjustment factor
    let adjustmentFactor = 1.0; // 定义变量 adjustmentFactor

    switch (marketCondition) { // 分支选择 marketCondition
      case MARKET_CONDITION.VOLATILE: // 分支 MARKET_CONDITION.VOLATILE
        // 高波动：减小切片，更频繁执行 / High volatility: smaller slices, more frequent
        adjustmentFactor = 0.7; // 赋值 adjustmentFactor
        break; // 跳出循环或分支

      case MARKET_CONDITION.LOW_LIQUIDITY: // 分支 MARKET_CONDITION.LOW_LIQUIDITY
        // 低流动性：减小切片 / Low liquidity: smaller slices
        adjustmentFactor = 0.5; // 赋值 adjustmentFactor
        break; // 跳出循环或分支

      case MARKET_CONDITION.TRENDING: // 分支 MARKET_CONDITION.TRENDING
        // 趋势市场：根据方向调整 / Trending: adjust based on direction
        // 如果趋势与我们的方向相反，加速执行 / If trend against us, accelerate
        adjustmentFactor = 1.2; // 赋值 adjustmentFactor
        break; // 跳出循环或分支

      default: // 默认分支
        adjustmentFactor = 1.0; // 赋值 adjustmentFactor
    } // 结束代码块

    // 检查参与率 / Check participation rate
    if (this.orderBookAnalyzer && this.config.maxParticipationRate > 0) { // 条件判断 this.orderBookAnalyzer && this.config.maxPart...
      const dailyVolume = this.orderBookAnalyzer.dailyVolumeCache.get(task.symbol); // 定义常量 dailyVolume
      if (dailyVolume > 0) { // 条件判断 dailyVolume > 0
        const expectedInterval = task.duration / task.slices.length; // 定义常量 expectedInterval
        const intervalHours = expectedInterval / (60 * 60 * 1000); // 定义常量 intervalHours
        const intervalVolume = dailyVolume * intervalHours / 24; // 定义常量 intervalVolume
        const maxSliceSize = intervalVolume * this.config.maxParticipationRate; // 定义常量 maxSliceSize

        if (slice.size > maxSliceSize) { // 条件判断 slice.size > maxSliceSize
          adjustmentFactor = Math.min(adjustmentFactor, maxSliceSize / slice.size); // 赋值 adjustmentFactor
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 记录调整 / Record adjustment
    if (adjustmentFactor !== 1.0) { // 条件判断 adjustmentFactor !== 1.0
      task.adjustmentHistory.push({ // 调用 task.adjustmentHistory.push
        sliceIndex: slice.index, // 设置 sliceIndex 字段
        originalSize: slice.size, // 设置 originalSize 字段
        adjustedSize: slice.size * adjustmentFactor, // 设置 adjustedSize 字段
        adjustmentFactor, // 执行语句
        marketCondition, // 执行语句
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    } // 结束代码块

    // 返回调整后的切片 / Return adjusted slice
    return { // 返回结果
      ...slice, // 展开对象或数组
      size: slice.size * adjustmentFactor, // 设置 size 字段
      adjusted: adjustmentFactor !== 1.0, // 设置 adjusted 字段
      adjustmentFactor, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 评估市场状态
   * Assess market condition
   *
   * @param {Object} task - 执行任务 / Execution task
   * @returns {string} 市场状态 / Market condition
   * @private
   */
  async _assessMarketCondition(task) { // 执行语句
    if (!this.orderBookAnalyzer) { // 条件判断 !this.orderBookAnalyzer
      return MARKET_CONDITION.NORMAL; // 返回结果
    } // 结束代码块

    // 分析盘口趋势 / Analyze order book trend
    const trend = this.orderBookAnalyzer.analyzeTrend(task.symbol, 60000); // 定义常量 trend

    // 获取流动性评估 / Get liquidity assessment
    const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol); // 定义常量 orderBook
    if (!orderBook) { // 条件判断 !orderBook
      return MARKET_CONDITION.NORMAL; // 返回结果
    } // 结束代码块

    const depthAnalysis = this.orderBookAnalyzer.analyzeDepth(orderBook, task.symbol); // 定义常量 depthAnalysis
    const liquidity = this.orderBookAnalyzer.assessLiquidity( // 定义常量 liquidity
      task.symbol, // 执行语句
      task.remainingSize / (task.slices.length - task.currentSliceIndex), // 执行语句
      depthAnalysis // 执行语句
    ); // 结束调用或参数

    // 判断市场状态 / Determine market condition
    if (liquidity.level === 'very_low' || liquidity.level === 'low') { // 条件判断 liquidity.level === 'very_low' || liquidity.l...
      return MARKET_CONDITION.LOW_LIQUIDITY; // 返回结果
    } // 结束代码块

    if (depthAnalysis.spreadBps > 20) { // 条件判断 depthAnalysis.spreadBps > 20
      return MARKET_CONDITION.VOLATILE; // 返回结果
    } // 结束代码块

    if (trend.hasTrend && (trend.trendDirection === 'bullish' || trend.trendDirection === 'bearish')) { // 条件判断 trend.hasTrend && (trend.trendDirection === '...
      return MARKET_CONDITION.TRENDING; // 返回结果
    } // 结束代码块

    return MARKET_CONDITION.NORMAL; // 返回结果
  } // 结束代码块

  /**
   * 检查是否需要紧急停止
   * Check if emergency stop needed
   *
   * @param {Object} task - 执行任务 / Execution task
   * @returns {boolean} 是否需要紧急停止 / Whether emergency stop needed
   * @private
   */
  _checkEmergencyStop(task) { // 调用 _checkEmergencyStop
    // 检查累计滑点 / Check cumulative slippage
    if (task.benchmarkPrice && task.avgExecutionPrice) { // 条件判断 task.benchmarkPrice && task.avgExecutionPrice
      const totalSlippage = task.side === 'buy' // 定义常量 totalSlippage
        ? (task.avgExecutionPrice - task.benchmarkPrice) / task.benchmarkPrice // 执行语句
        : (task.benchmarkPrice - task.avgExecutionPrice) / task.benchmarkPrice; // 执行语句

      if (totalSlippage > this.config.emergencyStopThreshold) { // 条件判断 totalSlippage > this.config.emergencyStopThre...
        this.log( // 调用 log
          `紧急停止：累计滑点 ${(totalSlippage * 100).toFixed(2)}% 超过阈值 / ` + // 执行语句
          `Emergency stop: cumulative slippage ${(totalSlippage * 100).toFixed(2)}% exceeds threshold`, // 执行语句
          'error' // 执行语句
        ); // 结束调用或参数
        this.emit('emergencyStop', { task, totalSlippage }); // 调用 emit
        return true; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 检查连续失败次数 / Check consecutive failures
    const recentRecords = task.executionRecords.slice(-5); // 定义常量 recentRecords
    const failedCount = recentRecords.filter(r => r.status === 'failed').length; // 定义函数 failedCount

    if (failedCount >= 3) { // 条件判断 failedCount >= 3
      this.log( // 调用 log
        `紧急停止：连续失败 ${failedCount} 次 / ` + // 执行语句
        `Emergency stop: ${failedCount} consecutive failures`, // 执行语句
        'error' // 执行语句
      ); // 结束调用或参数
      return true; // 返回结果
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 完成任务处理
   * Finalize task
   *
   * @param {Object} task - 执行任务 / Execution task
   * @private
   */
  _finalizeTask(task) { // 调用 _finalizeTask
    // 计算最终统计 / Calculate final statistics
    task.completedAt = Date.now(); // 赋值 task.completedAt
    task.actualDuration = task.completedAt - task.startTime; // 赋值 task.actualDuration

    // 计算总滑点 / Calculate total slippage
    if (task.benchmarkPrice && task.avgExecutionPrice) { // 条件判断 task.benchmarkPrice && task.avgExecutionPrice
      task.totalSlippage = task.side === 'buy' // 赋值 task.totalSlippage
        ? (task.avgExecutionPrice - task.benchmarkPrice) / task.benchmarkPrice // 执行语句
        : (task.benchmarkPrice - task.avgExecutionPrice) / task.benchmarkPrice; // 执行语句
    } // 结束代码块

    // 计算完成率 / Calculate completion rate
    task.completionRate = task.executedSize / task.totalSize; // 赋值 task.completionRate

    // 更新全局统计 / Update global statistics
    if (task.status === EXECUTION_STATUS.COMPLETED) { // 条件判断 task.status === EXECUTION_STATUS.COMPLETED
      this.stats.completedTasks++; // 访问 stats
    } // 结束代码块
    this.stats.totalVolume += task.executedSize; // 访问 stats
    this.stats.totalSlippage += task.totalSlippage || 0; // 访问 stats
    this.stats.avgSlippage = this.stats.totalSlippage / (this.stats.completedTasks || 1); // 访问 stats

    // 保存到历史记录 / Save to history
    this.executionHistory.push({ // 访问 executionHistory
      taskId: task.taskId, // 设置 taskId 字段
      symbol: task.symbol, // 设置 symbol 字段
      side: task.side, // 设置 side 字段
      algoType: task.algoType, // 设置 algoType 字段
      totalSize: task.totalSize, // 设置 totalSize 字段
      executedSize: task.executedSize, // 设置 executedSize 字段
      avgExecutionPrice: task.avgExecutionPrice, // 设置 avgExecutionPrice 字段
      benchmarkPrice: task.benchmarkPrice, // 设置 benchmarkPrice 字段
      totalSlippage: task.totalSlippage, // 设置 totalSlippage 字段
      completionRate: task.completionRate, // 设置 completionRate 字段
      status: task.status, // 设置 status 字段
      duration: task.actualDuration, // 设置 duration 字段
      sliceCount: task.slices.length, // 设置 sliceCount 字段
      completedAt: task.completedAt, // 设置 completedAt 字段
    }); // 结束代码块

    // 从活跃任务中移除 / Remove from active tasks
    this.activeTasks.delete(task.taskId); // 访问 activeTasks

    // 发出完成事件 / Emit completed event
    this.emit('taskCompleted', { task }); // 调用 emit

    // 记录日志 / Log
    this.log( // 调用 log
      `任务完成: ${task.taskId}, ` + // 执行语句
      `执行 ${task.executedSize}/${task.totalSize} (${(task.completionRate * 100).toFixed(1)}%), ` + // 执行语句
      `滑点 ${((task.totalSlippage || 0) * 10000).toFixed(1)} bps / ` + // 执行语句
      `Task completed`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取任务状态
   * Get task status
   *
   * @param {string} taskId - 任务 ID / Task ID
   * @returns {Object|null} 任务状态 / Task status
   */
  getTaskStatus(taskId) { // 调用 getTaskStatus
    const task = this.activeTasks.get(taskId); // 定义常量 task
    if (!task) { // 条件判断 !task
      return null; // 返回结果
    } // 结束代码块

    return { // 返回结果
      taskId: task.taskId, // 设置 taskId 字段
      status: task.status, // 设置 status 字段
      progress: task.executedSize / task.totalSize, // 设置 progress 字段
      executedSize: task.executedSize, // 设置 executedSize 字段
      remainingSize: task.remainingSize, // 设置 remainingSize 字段
      avgExecutionPrice: task.avgExecutionPrice, // 设置 avgExecutionPrice 字段
      currentSlice: task.currentSliceIndex, // 设置 currentSlice 字段
      totalSlices: task.slices.length, // 设置 totalSlices 字段
      elapsedTime: Date.now() - task.startTime, // 设置 elapsedTime 字段
      remainingTime: Math.max(0, task.endTime - Date.now()), // 设置 remainingTime 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有活跃任务
   * Get all active tasks
   *
   * @returns {Array} 活跃任务列表 / Active task list
   */
  getActiveTasks() { // 调用 getActiveTasks
    return Array.from(this.activeTasks.values()).map(task => this.getTaskStatus(task.taskId)); // 返回结果
  } // 结束代码块

  /**
   * 获取执行历史
   * Get execution history
   *
   * @param {number} limit - 限制数量 / Limit count
   * @returns {Array} 历史记录 / History records
   */
  getExecutionHistory(limit = 100) { // 调用 getExecutionHistory
    return this.executionHistory.slice(-limit); // 返回结果
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
      activeTasks: this.activeTasks.size, // 设置 activeTasks 字段
      historyCount: this.executionHistory.length, // 设置 historyCount 字段
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

    const prefix = '[TWAP/VWAP]'; // 定义常量 prefix
    const fullMessage = `${prefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出切片生成器 / Export slice generator
export { SliceGenerator }; // 导出命名成员

// 默认导出 / Default export
export default TWAPVWAPExecutor; // 默认导出
