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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 执行算法类型
 * Execution algorithm types
 */
export const ALGO_TYPE = {
  TWAP: 'twap',     // 时间加权 / Time weighted
  VWAP: 'vwap',     // 成交量加权 / Volume weighted
  ADAPTIVE: 'adaptive',  // 自适应 / Adaptive
};

/**
 * 执行状态
 * Execution status
 */
export const EXECUTION_STATUS = {
  PENDING: 'pending',         // 等待开始 / Pending
  RUNNING: 'running',         // 执行中 / Running
  PAUSED: 'paused',          // 暂停 / Paused
  COMPLETED: 'completed',     // 已完成 / Completed
  CANCELED: 'canceled',       // 已取消 / Canceled
  FAILED: 'failed',          // 失败 / Failed
};

/**
 * 市场状态
 * Market condition
 */
export const MARKET_CONDITION = {
  NORMAL: 'normal',           // 正常 / Normal
  VOLATILE: 'volatile',       // 波动 / Volatile
  TRENDING: 'trending',       // 趋势 / Trending
  LOW_LIQUIDITY: 'low_liquidity',  // 低流动性 / Low liquidity
};

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // 默认执行时间（毫秒）/ Default execution duration (ms)
  defaultDuration: 30 * 60 * 1000,  // 30 分钟 / 30 minutes

  // 最小切片间隔（毫秒）/ Minimum slice interval (ms)
  minSliceInterval: 5000,  // 5 秒 / 5 seconds

  // 最大切片间隔（毫秒）/ Maximum slice interval (ms)
  maxSliceInterval: 60000,  // 1 分钟 / 1 minute

  // 切片数量 / Number of slices
  defaultSlices: 20,

  // 最大滑点容忍度 / Maximum slippage tolerance
  maxSlippage: 0.005,  // 0.5%

  // 价格偏离暂停阈值 / Price deviation pause threshold
  priceDeviationPause: 0.02,  // 2%

  // 紧急停止阈值 / Emergency stop threshold
  emergencyStopThreshold: 0.05,  // 5%

  // 参与率上限（相对于市场成交量）/ Participation rate limit
  maxParticipationRate: 0.1,  // 10%

  // 是否启用动态调整 / Enable dynamic adjustment
  enableDynamicAdjustment: true,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,
};

/**
 * 预设的成交量分布曲线（按小时）
 * Preset volume distribution curves (by hour)
 */
export const VOLUME_CURVES = {
  // 加密货币24小时分布（基于历史数据）/ Crypto 24h distribution
  crypto: [
    0.032, 0.028, 0.025, 0.024, 0.026, 0.032,  // 00:00 - 05:00
    0.042, 0.055, 0.062, 0.058, 0.052, 0.048,  // 06:00 - 11:00
    0.045, 0.048, 0.055, 0.062, 0.058, 0.052,  // 12:00 - 17:00
    0.048, 0.045, 0.042, 0.038, 0.035, 0.033,  // 18:00 - 23:00
  ],

  // 美股交易时段分布 / US stock trading hours distribution
  usStock: [
    0, 0, 0, 0, 0, 0,                          // 00:00 - 05:00 (休市)
    0, 0, 0, 0.12, 0.10, 0.08,                 // 06:00 - 11:00 (09:30 开盘)
    0.07, 0.06, 0.06, 0.08, 0.10, 0,           // 12:00 - 17:00 (16:00 收盘)
    0, 0, 0, 0, 0, 0,                          // 18:00 - 23:00 (休市)
  ],

  // 均匀分布 / Uniform distribution
  uniform: Array(24).fill(1 / 24),
};

// ============================================
// 切片生成器 / Slice Generator
// ============================================

/**
 * 执行切片生成器
 * Execution slice generator
 */
class SliceGenerator {
  /**
   * 生成 TWAP 切片
   * Generate TWAP slices
   *
   * @param {number} totalSize - 总量 / Total size
   * @param {number} sliceCount - 切片数 / Slice count
   * @param {number} duration - 执行时长（毫秒）/ Duration (ms)
   * @returns {Array} 切片列表 / Slice list
   */
  static generateTWAPSlices(totalSize, sliceCount, duration) {
    const slices = [];
    const sliceSize = totalSize / sliceCount;
    const interval = duration / sliceCount;

    for (let i = 0; i < sliceCount; i++) {
      slices.push({
        index: i,
        size: sliceSize,
        scheduledTime: i * interval,
        weight: 1 / sliceCount,
      });
    }

    return slices;
  }

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
  static generateVWAPSlices(totalSize, sliceCount, duration, volumeCurve, startTime) {
    const slices = [];
    const interval = duration / sliceCount;

    // 计算每个切片对应的成交量权重 / Calculate volume weight for each slice
    const weights = [];
    let totalWeight = 0;

    for (let i = 0; i < sliceCount; i++) {
      // 计算切片对应的时间点 / Calculate time point for slice
      const sliceTime = new Date(startTime.getTime() + i * interval);
      const hour = sliceTime.getUTCHours();

      // 获取该时段的成交量权重 / Get volume weight for this hour
      const hourWeight = volumeCurve[hour] || (1 / 24);
      weights.push(hourWeight);
      totalWeight += hourWeight;
    }

    // 归一化权重并生成切片 / Normalize weights and generate slices
    for (let i = 0; i < sliceCount; i++) {
      const normalizedWeight = weights[i] / totalWeight;
      slices.push({
        index: i,
        size: totalSize * normalizedWeight,
        scheduledTime: i * interval,
        weight: normalizedWeight,
        hour: new Date(startTime.getTime() + i * interval).getUTCHours(),
      });
    }

    return slices;
  }

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
  static generateAdaptiveSlices(totalSize, sliceCount, duration, marketData) {
    const {
      volatility = 0.02,      // 波动率 / Volatility
      liquidity = 'medium',   // 流动性 / Liquidity
      trend = 'neutral',      // 趋势 / Trend
    } = marketData;

    // 根据市场状态调整切片策略 / Adjust slice strategy based on market condition
    let sizeMultipliers = Array(sliceCount).fill(1);

    // 高波动时：前轻后重 / High volatility: light early, heavy late
    if (volatility > 0.03) {
      sizeMultipliers = sizeMultipliers.map((_, i) => 0.5 + (i / sliceCount));
    }

    // 低流动性：更均匀分布 / Low liquidity: more uniform distribution
    if (liquidity === 'low') {
      sizeMultipliers = Array(sliceCount).fill(1);
    }

    // 强趋势：加快执行 / Strong trend: accelerate execution
    if (trend === 'strong_up' || trend === 'strong_down') {
      sizeMultipliers = sizeMultipliers.map((_, i) => 1.5 - (i / sliceCount) * 0.8);
    }

    // 归一化并生成切片 / Normalize and generate slices
    const totalMultiplier = sizeMultipliers.reduce((a, b) => a + b, 0);
    const slices = [];

    for (let i = 0; i < sliceCount; i++) {
      const weight = sizeMultipliers[i] / totalMultiplier;
      slices.push({
        index: i,
        size: totalSize * weight,
        scheduledTime: i * (duration / sliceCount),
        weight,
        adaptiveFactors: {
          volatility,
          liquidity,
          trend,
        },
      });
    }

    return slices;
  }
}

// ============================================
// 主类 / Main Class
// ============================================

/**
 * TWAP/VWAP 执行器
 * TWAP/VWAP Executor
 */
export class TWAPVWAPExecutor extends EventEmitter {
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

    // 活跃执行任务 / Active execution tasks
    // 格式: { taskId: ExecutionTask }
    this.activeTasks = new Map();

    // 历史执行记录 / Historical execution records
    this.executionHistory = [];

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null;

    // 盘口分析器引用 / Order book analyzer reference
    this.orderBookAnalyzer = null;

    // 统计信息 / Statistics
    this.stats = {
      totalTasks: 0,            // 总任务数 / Total tasks
      completedTasks: 0,        // 完成任务数 / Completed tasks
      canceledTasks: 0,         // 取消任务数 / Canceled tasks
      totalVolume: 0,           // 总成交量 / Total volume
      totalSlippage: 0,         // 总滑点 / Total slippage
      avgSlippage: 0,           // 平均滑点 / Average slippage
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

    this.log('TWAP/VWAP 执行器初始化完成 / TWAP/VWAP executor initialized', 'info');
  }

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
  createTWAPTask(params) {
    return this._createExecutionTask({
      ...params,
      algoType: ALGO_TYPE.TWAP,
    });
  }

  /**
   * 创建 VWAP 执行任务
   * Create VWAP execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   */
  createVWAPTask(params) {
    return this._createExecutionTask({
      ...params,
      algoType: ALGO_TYPE.VWAP,
    });
  }

  /**
   * 创建自适应执行任务
   * Create adaptive execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   */
  createAdaptiveTask(params) {
    return this._createExecutionTask({
      ...params,
      algoType: ALGO_TYPE.ADAPTIVE,
    });
  }

  /**
   * 创建执行任务
   * Create execution task
   *
   * @param {Object} params - 任务参数 / Task parameters
   * @returns {Object} 执行任务 / Execution task
   * @private
   */
  _createExecutionTask(params) {
    const {
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
    } = params;

    // 生成任务 ID / Generate task ID
    const taskId = `${algoType}_${symbol}_${Date.now()}`;

    // 生成执行切片 / Generate execution slices
    let slices;
    switch (algoType) {
      case ALGO_TYPE.VWAP:
        slices = SliceGenerator.generateVWAPSlices(
          totalSize, sliceCount, duration, volumeCurve, startTime
        );
        break;

      case ALGO_TYPE.ADAPTIVE:
        slices = SliceGenerator.generateAdaptiveSlices(
          totalSize, sliceCount, duration, marketData
        );
        break;

      case ALGO_TYPE.TWAP:
      default:
        slices = SliceGenerator.generateTWAPSlices(totalSize, sliceCount, duration);
        break;
    }

    // 创建任务对象 / Create task object
    const task = {
      // 基本信息 / Basic info
      taskId,
      exchangeId,
      symbol,
      side,
      algoType,

      // 数量信息 / Size info
      totalSize,
      executedSize: 0,
      remainingSize: totalSize,

      // 时间信息 / Time info
      duration,
      startTime: startTime.getTime(),
      endTime: startTime.getTime() + duration,
      createdAt: Date.now(),

      // 切片信息 / Slice info
      slices,
      currentSliceIndex: 0,

      // 价格信息 / Price info
      limitPrice,
      maxSlippage,
      benchmarkPrice: null,  // 基准价格（执行开始时的价格）/ Benchmark price
      avgExecutionPrice: 0,  // 平均成交价 / Average execution price
      totalCost: 0,          // 总成本 / Total cost

      // 状态 / Status
      status: EXECUTION_STATUS.PENDING,

      // 执行记录 / Execution records
      executionRecords: [],

      // 动态调整参数 / Dynamic adjustment params
      adjustmentHistory: [],
      currentParticipationRate: 0,

      // 选项 / Options
      options,
    };

    // 保存任务 / Save task
    this.activeTasks.set(taskId, task);

    // 更新统计 / Update stats
    this.stats.totalTasks++;

    // 发出事件 / Emit event
    this.emit('taskCreated', { task });

    // 记录日志 / Log
    this.log(
      `创建 ${algoType.toUpperCase()} 任务: ${taskId}, ` +
      `${symbol} ${side} ${totalSize}, 时长 ${duration / 1000}s / ` +
      `Created ${algoType.toUpperCase()} task`,
      'info'
    );

    return task;
  }

  /**
   * 启动执行任务
   * Start execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   * @returns {Promise<void>}
   */
  async startTask(taskId) {
    // 获取任务 / Get task
    const task = this.activeTasks.get(taskId);

    if (!task) {
      throw new Error(`任务不存在 / Task not found: ${taskId}`);
    }

    if (task.status !== EXECUTION_STATUS.PENDING && task.status !== EXECUTION_STATUS.PAUSED) {
      throw new Error(`任务状态不允许启动 / Task status does not allow starting: ${task.status}`);
    }

    // 设置基准价格 / Set benchmark price
    if (!task.benchmarkPrice && this.orderBookAnalyzer) {
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol);
      if (orderBook) {
        task.benchmarkPrice = task.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid;
      }
    }

    // 更新状态 / Update status
    task.status = EXECUTION_STATUS.RUNNING;

    // 发出事件 / Emit event
    this.emit('taskStarted', { task });

    // 记录日志 / Log
    this.log(`启动任务: ${taskId} / Started task: ${taskId}`, 'info');

    // 开始执行循环 / Start execution loop
    await this._runExecutionLoop(task);
  }

  /**
   * 暂停执行任务
   * Pause execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   */
  pauseTask(taskId) {
    const task = this.activeTasks.get(taskId);

    if (!task || task.status !== EXECUTION_STATUS.RUNNING) {
      return false;
    }

    task.status = EXECUTION_STATUS.PAUSED;
    this.emit('taskPaused', { task });
    this.log(`暂停任务: ${taskId} / Paused task: ${taskId}`, 'info');

    return true;
  }

  /**
   * 取消执行任务
   * Cancel execution task
   *
   * @param {string} taskId - 任务 ID / Task ID
   */
  cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return false;
    }

    // 更新状态 / Update status
    task.status = EXECUTION_STATUS.CANCELED;
    task.canceledAt = Date.now();

    // 计算最终统计 / Calculate final statistics
    this._finalizeTask(task);

    // 更新统计 / Update stats
    this.stats.canceledTasks++;

    // 发出事件 / Emit event
    this.emit('taskCanceled', { task });

    // 记录日志 / Log
    this.log(
      `取消任务: ${taskId}, 已执行 ${task.executedSize}/${task.totalSize} / ` +
      `Canceled task: ${taskId}, executed ${task.executedSize}/${task.totalSize}`,
      'info'
    );

    return true;
  }

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
  async _runExecutionLoop(task) {
    while (task.status === EXECUTION_STATUS.RUNNING) {
      // 检查是否还有剩余量 / Check if there's remaining size
      if (task.remainingSize <= 0) {
        task.status = EXECUTION_STATUS.COMPLETED;
        break;
      }

      // 检查是否超时 / Check if timed out
      if (Date.now() > task.endTime) {
        this.log(`任务超时: ${task.taskId} / Task timed out: ${task.taskId}`, 'warn');
        // 继续执行剩余量（加速模式）/ Continue executing remaining (accelerated mode)
        if (task.remainingSize > task.totalSize * 0.1) {
          // 剩余超过10%，警告但继续 / Remaining > 10%, warn but continue
          this.emit('taskOvertime', { task });
        }
      }

      // 获取当前切片 / Get current slice
      const currentSlice = task.slices[task.currentSliceIndex];

      if (!currentSlice) {
        // 没有更多切片，但还有剩余量 / No more slices but remaining size
        // 创建最后一个补充切片 / Create final supplementary slice
        await this._executeSupplementarySlice(task);
        break;
      }

      // 检查是否到达切片执行时间 / Check if slice execution time reached
      const elapsedTime = Date.now() - task.startTime;
      if (elapsedTime < currentSlice.scheduledTime) {
        // 还没到时间，等待 / Not yet time, wait
        const waitTime = Math.min(
          currentSlice.scheduledTime - elapsedTime,
          this.config.maxSliceInterval
        );
        await this._sleep(waitTime);
        continue;
      }

      // 动态调整切片大小 / Dynamically adjust slice size
      const adjustedSlice = this.config.enableDynamicAdjustment
        ? await this._adjustSlice(task, currentSlice)
        : currentSlice;

      // 执行切片 / Execute slice
      try {
        await this._executeSlice(task, adjustedSlice);
      } catch (error) {
        this.log(`切片执行失败: ${error.message} / Slice execution failed`, 'error');

        // 检查是否需要紧急停止 / Check if emergency stop needed
        if (this._checkEmergencyStop(task)) {
          task.status = EXECUTION_STATUS.FAILED;
          task.error = error.message;
          break;
        }
      }

      // 移动到下一个切片 / Move to next slice
      task.currentSliceIndex++;

      // 短暂延迟，避免过于频繁 / Short delay to avoid too frequent
      await this._sleep(this.config.minSliceInterval);
    }

    // 完成任务处理 / Finalize task
    if (task.status === EXECUTION_STATUS.RUNNING) {
      task.status = EXECUTION_STATUS.COMPLETED;
    }

    this._finalizeTask(task);
  }

  /**
   * 执行单个切片
   * Execute single slice
   *
   * @param {Object} task - 执行任务 / Execution task
   * @param {Object} slice - 切片 / Slice
   * @private
   */
  async _executeSlice(task, slice) {
    // 计算实际执行量（不超过剩余量）/ Calculate actual execution size
    const executeSize = Math.min(slice.size, task.remainingSize);

    if (executeSize <= 0) {
      return;
    }

    // 获取当前市场价格 / Get current market price
    let currentPrice = null;
    if (this.orderBookAnalyzer) {
      const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol);
      if (orderBook) {
        currentPrice = task.side === 'buy' ? orderBook.bestAsk : orderBook.bestBid;
      }
    }

    // 检查价格偏离 / Check price deviation
    if (task.benchmarkPrice && currentPrice) {
      const deviation = Math.abs(currentPrice - task.benchmarkPrice) / task.benchmarkPrice;

      if (deviation > this.config.priceDeviationPause) {
        this.log(
          `价格偏离 ${(deviation * 100).toFixed(2)}%，暂停执行 / ` +
          `Price deviation ${(deviation * 100).toFixed(2)}%, pausing`,
          'warn'
        );
        this.emit('priceDeviation', { task, deviation, currentPrice });

        // 等待一个切片间隔后重试 / Wait one slice interval before retry
        await this._sleep(task.duration / task.slices.length);
        return;
      }
    }

    // 检查限价约束 / Check limit price constraint
    if (task.limitPrice) {
      const priceOk = task.side === 'buy'
        ? currentPrice <= task.limitPrice
        : currentPrice >= task.limitPrice;

      if (!priceOk) {
        this.log(
          `当前价格 ${currentPrice} 不满足限价 ${task.limitPrice}，跳过切片 / ` +
          `Current price ${currentPrice} does not meet limit ${task.limitPrice}, skipping`,
          'info'
        );
        return;
      }
    }

    // 记录执行开始 / Record execution start
    const executionRecord = {
      sliceIndex: slice.index,
      plannedSize: slice.size,
      actualSize: executeSize,
      startTime: Date.now(),
      startPrice: currentPrice,
      endPrice: null,
      avgPrice: null,
      slippage: null,
      status: 'pending',
    };

    // 执行订单 / Execute order
    try {
      if (this.orderExecutor) {
        // 使用订单执行器 / Use order executor
        const result = await this.orderExecutor.executeSmartLimitOrder({
          exchangeId: task.exchangeId,
          symbol: task.symbol,
          side: task.side,
          amount: executeSize,
          price: currentPrice,
          postOnly: false,  // TWAP/VWAP 通常需要尽快成交 / TWAP/VWAP usually needs quick execution
          options: {
            taskId: task.taskId,
            sliceIndex: slice.index,
          },
        });

        // 更新执行记录 / Update execution record
        executionRecord.endTime = Date.now();
        executionRecord.avgPrice = result.orderInfo?.avgPrice || currentPrice;
        executionRecord.filledSize = result.orderInfo?.filledAmount || executeSize;
        executionRecord.status = 'completed';

      } else {
        // 模拟执行（用于测试）/ Simulated execution (for testing)
        executionRecord.endTime = Date.now();
        executionRecord.avgPrice = currentPrice;
        executionRecord.filledSize = executeSize;
        executionRecord.status = 'simulated';
      }

      // 计算滑点 / Calculate slippage
      if (task.benchmarkPrice && executionRecord.avgPrice) {
        executionRecord.slippage = task.side === 'buy'
          ? (executionRecord.avgPrice - task.benchmarkPrice) / task.benchmarkPrice
          : (task.benchmarkPrice - executionRecord.avgPrice) / task.benchmarkPrice;
      }

      // 更新任务状态 / Update task status
      const filledSize = executionRecord.filledSize || executeSize;
      task.executedSize += filledSize;
      task.remainingSize -= filledSize;
      task.totalCost += filledSize * (executionRecord.avgPrice || currentPrice);
      task.avgExecutionPrice = task.totalCost / task.executedSize;

      // 保存执行记录 / Save execution record
      task.executionRecords.push(executionRecord);

      // 发出事件 / Emit event
      this.emit('sliceExecuted', {
        task,
        slice,
        executionRecord,
        progress: task.executedSize / task.totalSize,
      });

      // 记录日志 / Log
      this.log(
        `执行切片 ${slice.index + 1}/${task.slices.length}: ` +
        `${filledSize.toFixed(4)} @ ${executionRecord.avgPrice?.toFixed(2)}, ` +
        `进度 ${((task.executedSize / task.totalSize) * 100).toFixed(1)}% / ` +
        `Executed slice`,
        'info'
      );

    } catch (error) {
      executionRecord.status = 'failed';
      executionRecord.error = error.message;
      executionRecord.endTime = Date.now();
      task.executionRecords.push(executionRecord);

      throw error;
    }
  }

  /**
   * 执行补充切片（处理剩余量）
   * Execute supplementary slice (handle remaining size)
   *
   * @param {Object} task - 执行任务 / Execution task
   * @private
   */
  async _executeSupplementarySlice(task) {
    if (task.remainingSize <= 0) {
      return;
    }

    this.log(
      `执行补充切片，剩余量 ${task.remainingSize} / ` +
      `Executing supplementary slice, remaining ${task.remainingSize}`,
      'info'
    );

    // 创建补充切片 / Create supplementary slice
    const supplementarySlice = {
      index: task.slices.length,
      size: task.remainingSize,
      scheduledTime: Date.now() - task.startTime,
      weight: task.remainingSize / task.totalSize,
      isSupplementary: true,
    };

    await this._executeSlice(task, supplementarySlice);
  }

  /**
   * 动态调整切片
   * Dynamically adjust slice
   *
   * @param {Object} task - 执行任务 / Execution task
   * @param {Object} slice - 原始切片 / Original slice
   * @returns {Object} 调整后的切片 / Adjusted slice
   * @private
   */
  async _adjustSlice(task, slice) {
    // 获取市场状态 / Get market condition
    const marketCondition = await this._assessMarketCondition(task);

    // 计算调整因子 / Calculate adjustment factor
    let adjustmentFactor = 1.0;

    switch (marketCondition) {
      case MARKET_CONDITION.VOLATILE:
        // 高波动：减小切片，更频繁执行 / High volatility: smaller slices, more frequent
        adjustmentFactor = 0.7;
        break;

      case MARKET_CONDITION.LOW_LIQUIDITY:
        // 低流动性：减小切片 / Low liquidity: smaller slices
        adjustmentFactor = 0.5;
        break;

      case MARKET_CONDITION.TRENDING:
        // 趋势市场：根据方向调整 / Trending: adjust based on direction
        // 如果趋势与我们的方向相反，加速执行 / If trend against us, accelerate
        adjustmentFactor = 1.2;
        break;

      default:
        adjustmentFactor = 1.0;
    }

    // 检查参与率 / Check participation rate
    if (this.orderBookAnalyzer && this.config.maxParticipationRate > 0) {
      const dailyVolume = this.orderBookAnalyzer.dailyVolumeCache.get(task.symbol);
      if (dailyVolume > 0) {
        const expectedInterval = task.duration / task.slices.length;
        const intervalHours = expectedInterval / (60 * 60 * 1000);
        const intervalVolume = dailyVolume * intervalHours / 24;
        const maxSliceSize = intervalVolume * this.config.maxParticipationRate;

        if (slice.size > maxSliceSize) {
          adjustmentFactor = Math.min(adjustmentFactor, maxSliceSize / slice.size);
        }
      }
    }

    // 记录调整 / Record adjustment
    if (adjustmentFactor !== 1.0) {
      task.adjustmentHistory.push({
        sliceIndex: slice.index,
        originalSize: slice.size,
        adjustedSize: slice.size * adjustmentFactor,
        adjustmentFactor,
        marketCondition,
        timestamp: Date.now(),
      });
    }

    // 返回调整后的切片 / Return adjusted slice
    return {
      ...slice,
      size: slice.size * adjustmentFactor,
      adjusted: adjustmentFactor !== 1.0,
      adjustmentFactor,
    };
  }

  /**
   * 评估市场状态
   * Assess market condition
   *
   * @param {Object} task - 执行任务 / Execution task
   * @returns {string} 市场状态 / Market condition
   * @private
   */
  async _assessMarketCondition(task) {
    if (!this.orderBookAnalyzer) {
      return MARKET_CONDITION.NORMAL;
    }

    // 分析盘口趋势 / Analyze order book trend
    const trend = this.orderBookAnalyzer.analyzeTrend(task.symbol, 60000);

    // 获取流动性评估 / Get liquidity assessment
    const orderBook = this.orderBookAnalyzer.getCachedOrderBook(task.symbol);
    if (!orderBook) {
      return MARKET_CONDITION.NORMAL;
    }

    const depthAnalysis = this.orderBookAnalyzer.analyzeDepth(orderBook, task.symbol);
    const liquidity = this.orderBookAnalyzer.assessLiquidity(
      task.symbol,
      task.remainingSize / (task.slices.length - task.currentSliceIndex),
      depthAnalysis
    );

    // 判断市场状态 / Determine market condition
    if (liquidity.level === 'very_low' || liquidity.level === 'low') {
      return MARKET_CONDITION.LOW_LIQUIDITY;
    }

    if (depthAnalysis.spreadBps > 20) {
      return MARKET_CONDITION.VOLATILE;
    }

    if (trend.hasTrend && (trend.trendDirection === 'bullish' || trend.trendDirection === 'bearish')) {
      return MARKET_CONDITION.TRENDING;
    }

    return MARKET_CONDITION.NORMAL;
  }

  /**
   * 检查是否需要紧急停止
   * Check if emergency stop needed
   *
   * @param {Object} task - 执行任务 / Execution task
   * @returns {boolean} 是否需要紧急停止 / Whether emergency stop needed
   * @private
   */
  _checkEmergencyStop(task) {
    // 检查累计滑点 / Check cumulative slippage
    if (task.benchmarkPrice && task.avgExecutionPrice) {
      const totalSlippage = task.side === 'buy'
        ? (task.avgExecutionPrice - task.benchmarkPrice) / task.benchmarkPrice
        : (task.benchmarkPrice - task.avgExecutionPrice) / task.benchmarkPrice;

      if (totalSlippage > this.config.emergencyStopThreshold) {
        this.log(
          `紧急停止：累计滑点 ${(totalSlippage * 100).toFixed(2)}% 超过阈值 / ` +
          `Emergency stop: cumulative slippage ${(totalSlippage * 100).toFixed(2)}% exceeds threshold`,
          'error'
        );
        this.emit('emergencyStop', { task, totalSlippage });
        return true;
      }
    }

    // 检查连续失败次数 / Check consecutive failures
    const recentRecords = task.executionRecords.slice(-5);
    const failedCount = recentRecords.filter(r => r.status === 'failed').length;

    if (failedCount >= 3) {
      this.log(
        `紧急停止：连续失败 ${failedCount} 次 / ` +
        `Emergency stop: ${failedCount} consecutive failures`,
        'error'
      );
      return true;
    }

    return false;
  }

  /**
   * 完成任务处理
   * Finalize task
   *
   * @param {Object} task - 执行任务 / Execution task
   * @private
   */
  _finalizeTask(task) {
    // 计算最终统计 / Calculate final statistics
    task.completedAt = Date.now();
    task.actualDuration = task.completedAt - task.startTime;

    // 计算总滑点 / Calculate total slippage
    if (task.benchmarkPrice && task.avgExecutionPrice) {
      task.totalSlippage = task.side === 'buy'
        ? (task.avgExecutionPrice - task.benchmarkPrice) / task.benchmarkPrice
        : (task.benchmarkPrice - task.avgExecutionPrice) / task.benchmarkPrice;
    }

    // 计算完成率 / Calculate completion rate
    task.completionRate = task.executedSize / task.totalSize;

    // 更新全局统计 / Update global statistics
    if (task.status === EXECUTION_STATUS.COMPLETED) {
      this.stats.completedTasks++;
    }
    this.stats.totalVolume += task.executedSize;
    this.stats.totalSlippage += task.totalSlippage || 0;
    this.stats.avgSlippage = this.stats.totalSlippage / (this.stats.completedTasks || 1);

    // 保存到历史记录 / Save to history
    this.executionHistory.push({
      taskId: task.taskId,
      symbol: task.symbol,
      side: task.side,
      algoType: task.algoType,
      totalSize: task.totalSize,
      executedSize: task.executedSize,
      avgExecutionPrice: task.avgExecutionPrice,
      benchmarkPrice: task.benchmarkPrice,
      totalSlippage: task.totalSlippage,
      completionRate: task.completionRate,
      status: task.status,
      duration: task.actualDuration,
      sliceCount: task.slices.length,
      completedAt: task.completedAt,
    });

    // 从活跃任务中移除 / Remove from active tasks
    this.activeTasks.delete(task.taskId);

    // 发出完成事件 / Emit completed event
    this.emit('taskCompleted', { task });

    // 记录日志 / Log
    this.log(
      `任务完成: ${task.taskId}, ` +
      `执行 ${task.executedSize}/${task.totalSize} (${(task.completionRate * 100).toFixed(1)}%), ` +
      `滑点 ${((task.totalSlippage || 0) * 10000).toFixed(1)} bps / ` +
      `Task completed`,
      'info'
    );
  }

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
  getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.executedSize / task.totalSize,
      executedSize: task.executedSize,
      remainingSize: task.remainingSize,
      avgExecutionPrice: task.avgExecutionPrice,
      currentSlice: task.currentSliceIndex,
      totalSlices: task.slices.length,
      elapsedTime: Date.now() - task.startTime,
      remainingTime: Math.max(0, task.endTime - Date.now()),
    };
  }

  /**
   * 获取所有活跃任务
   * Get all active tasks
   *
   * @returns {Array} 活跃任务列表 / Active task list
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values()).map(task => this.getTaskStatus(task.taskId));
  }

  /**
   * 获取执行历史
   * Get execution history
   *
   * @param {number} limit - 限制数量 / Limit count
   * @returns {Array} 历史记录 / History records
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
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
      activeTasks: this.activeTasks.size,
      historyCount: this.executionHistory.length,
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

    const prefix = '[TWAP/VWAP]';
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

// 导出切片生成器 / Export slice generator
export { SliceGenerator };

// 默认导出 / Default export
export default TWAPVWAPExecutor;
