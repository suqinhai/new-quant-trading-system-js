/**
 * 网络分区处理器
 * Network Partition Handler
 *
 * 功能 / Features:
 * 1. 本地与交易所状态不一致检测 / Local vs exchange state inconsistency detection
 * 2. 订单状态同步 / Order status synchronization
 * 3. 仓位状态校验 / Position status verification
 * 4. 余额状态校验 / Balance status verification
 * 5. 自动状态修复 / Automatic state repair
 * 6. 网络分区检测 / Network partition detection
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 同步状态
 * Sync status
 */
const SYNC_STATUS = { // 定义常量 SYNC_STATUS
  SYNCED: 'synced',             // 已同步 / Synced
  SYNCING: 'syncing',           // 同步中 / Syncing
  DIVERGED: 'diverged',         // 分歧 / Diverged
  UNKNOWN: 'unknown',           // 未知 / Unknown
}; // 结束代码块

/**
 * 不一致类型
 * Inconsistency type
 */
const INCONSISTENCY_TYPE = { // 定义常量 INCONSISTENCY_TYPE
  ORDER_STATUS: 'order_status',         // 订单状态不一致 / Order status inconsistency
  ORDER_MISSING: 'order_missing',       // 订单丢失 / Order missing
  ORDER_EXTRA: 'order_extra',           // 多余订单 / Extra order
  POSITION_SIZE: 'position_size',       // 仓位大小不一致 / Position size inconsistency
  POSITION_MISSING: 'position_missing', // 仓位丢失 / Position missing
  POSITION_EXTRA: 'position_extra',     // 多余仓位 / Extra position
  BALANCE_MISMATCH: 'balance_mismatch', // 余额不匹配 / Balance mismatch
  FILL_MISSING: 'fill_missing',         // 成交丢失 / Fill missing
}; // 结束代码块

/**
 * 修复动作
 * Repair action
 */
const REPAIR_ACTION = { // 定义常量 REPAIR_ACTION
  SYNC_ORDER: 'sync_order',             // 同步订单 / Sync order
  CANCEL_ORDER: 'cancel_order',         // 取消订单 / Cancel order
  SYNC_POSITION: 'sync_position',       // 同步仓位 / Sync position
  CLOSE_POSITION: 'close_position',     // 平仓 / Close position
  SYNC_BALANCE: 'sync_balance',         // 同步余额 / Sync balance
  FETCH_FILLS: 'fetch_fills',           // 获取成交 / Fetch fills
  NO_ACTION: 'no_action',               // 无动作 / No action
}; // 结束代码块

/**
 * 网络分区状态
 * Network partition status
 */
const PARTITION_STATUS = { // 定义常量 PARTITION_STATUS
  CONNECTED: 'connected',       // 已连接 / Connected
  PARTIAL: 'partial',           // 部分连接 / Partial connection
  PARTITIONED: 'partitioned',   // 分区 / Partitioned
  RECONNECTING: 'reconnecting', // 重连中 / Reconnecting
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 同步检查配置 / Sync Check Configuration
  // ============================================

  // 同步检查间隔 (毫秒) / Sync check interval (ms)
  syncCheckInterval: 30000,           // 30秒

  // 强制完全同步间隔 (毫秒) / Force full sync interval (ms)
  forceFullSyncInterval: 300000,      // 5分钟

  // 同步超时时间 (毫秒) / Sync timeout (ms)
  syncTimeout: 10000,                 // 10秒

  // ============================================
  // 容差配置 / Tolerance Configuration
  // ============================================

  // 仓位大小容差 / Position size tolerance
  positionSizeTolerance: 0.001,       // 0.1%

  // 余额容差 / Balance tolerance
  balanceTolerance: 0.0001,           // 0.01%

  // 价格容差 / Price tolerance
  priceTolerance: 0.001,              // 0.1%

  // ============================================
  // 网络分区检测配置 / Network Partition Detection Configuration
  // ============================================

  // 心跳间隔 (毫秒) / Heartbeat interval (ms)
  heartbeatInterval: 5000,            // 5秒

  // 心跳超时 (毫秒) / Heartbeat timeout (ms)
  heartbeatTimeout: 15000,            // 15秒

  // 连续心跳失败次数触发分区 / Consecutive heartbeat failures to trigger partition
  partitionThreshold: 3, // 设置 partitionThreshold 字段

  // ============================================
  // 修复配置 / Repair Configuration
  // ============================================

  // 启用自动修复 / Enable auto repair
  enableAutoRepair: true, // 设置 enableAutoRepair 字段

  // 修复前确认 / Confirm before repair
  confirmBeforeRepair: true, // 设置 confirmBeforeRepair 字段

  // 最大修复尝试次数 / Maximum repair attempts
  maxRepairAttempts: 3, // 设置 maxRepairAttempts 字段

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[NetworkPartition]', // 设置 logPrefix 字段

  // 历史记录保留数量 / History retention count
  historyLength: 500, // 设置 historyLength 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 网络分区处理器
 * Network Partition Handler
 */
export class NetworkPartitionHandler extends EventEmitter { // 导出类 NetworkPartitionHandler
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 本地状态 / Local state
    this.localState = { // 设置 localState
      orders: new Map(),        // { orderId: orderData }
      positions: new Map(),     // { symbol: positionData }
      balances: new Map(),      // { currency: balance }
      fills: new Map(),         // { fillId: fillData }
    }; // 结束代码块

    // 远程状态 (交易所) / Remote state (exchange)
    this.remoteState = { // 设置 remoteState
      orders: new Map(), // 设置 orders 字段
      positions: new Map(), // 设置 positions 字段
      balances: new Map(), // 设置 balances 字段
      fills: new Map(), // 设置 fills 字段
      lastSyncTime: null, // 设置 lastSyncTime 字段
    }; // 结束代码块

    // 同步状态 / Sync status
    this.syncStatus = SYNC_STATUS.UNKNOWN; // 设置 syncStatus

    // 网络分区状态 / Network partition status
    this.partitionStatus = PARTITION_STATUS.CONNECTED; // 设置 partitionStatus

    // 不一致记录 / Inconsistency records
    this.inconsistencies = []; // 设置 inconsistencies

    // 修复历史 / Repair history
    this.repairHistory = []; // 设置 repairHistory

    // 心跳统计 / Heartbeat statistics
    this.heartbeatStats = { // 设置 heartbeatStats
      consecutiveFailures: 0, // 设置 consecutiveFailures 字段
      lastSuccessTime: null, // 设置 lastSuccessTime 字段
      lastFailureTime: null, // 设置 lastFailureTime 字段
    }; // 结束代码块

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 定时器 / Timers
    this.syncCheckTimer = null; // 设置 syncCheckTimer
    this.heartbeatTimer = null; // 设置 heartbeatTimer
    this.fullSyncTimer = null; // 设置 fullSyncTimer

    // 交易所客户端引用 / Exchange client reference
    this.exchangeClient = null; // 设置 exchangeClient

    // 账户ID / Account ID
    this.accountId = null; // 设置 accountId
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    const { exchangeClient, accountId } = options; // 解构赋值

    this.exchangeClient = exchangeClient; // 设置 exchangeClient
    this.accountId = accountId || 'default'; // 设置 accountId

    // 执行初始同步 / Perform initial sync
    await this._performFullSync(); // 等待异步结果

    this.log('网络分区处理器初始化完成 / Network partition handler initialized', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动同步检查 / Start sync check
    this.syncCheckTimer = setInterval( // 设置 syncCheckTimer
      () => this._performQuickSync(), // 定义箭头函数
      this.config.syncCheckInterval // 访问 config
    ); // 结束调用或参数

    // 启动心跳检测 / Start heartbeat detection
    this.heartbeatTimer = setInterval( // 设置 heartbeatTimer
      () => this._performHeartbeat(), // 定义箭头函数
      this.config.heartbeatInterval // 访问 config
    ); // 结束调用或参数

    // 启动完全同步 / Start full sync
    this.fullSyncTimer = setInterval( // 设置 fullSyncTimer
      () => this._performFullSync(), // 定义箭头函数
      this.config.forceFullSyncInterval // 访问 config
    ); // 结束调用或参数

    this.log('网络分区处理器已启动 / Network partition handler started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.syncCheckTimer) { // 条件判断 this.syncCheckTimer
      clearInterval(this.syncCheckTimer); // 调用 clearInterval
      this.syncCheckTimer = null; // 设置 syncCheckTimer
    } // 结束代码块

    if (this.heartbeatTimer) { // 条件判断 this.heartbeatTimer
      clearInterval(this.heartbeatTimer); // 调用 clearInterval
      this.heartbeatTimer = null; // 设置 heartbeatTimer
    } // 结束代码块

    if (this.fullSyncTimer) { // 条件判断 this.fullSyncTimer
      clearInterval(this.fullSyncTimer); // 调用 clearInterval
      this.fullSyncTimer = null; // 设置 fullSyncTimer
    } // 结束代码块

    this.log('网络分区处理器已停止 / Network partition handler stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 本地状态管理 / Local State Management
  // ============================================

  /**
   * 更新本地订单
   * Update local order
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {Object} orderData - 订单数据 / Order data
   */
  updateLocalOrder(orderId, orderData) { // 调用 updateLocalOrder
    this.localState.orders.set(orderId, { // 访问 localState
      ...orderData, // 展开对象或数组
      updatedAt: Date.now(), // 设置 updatedAt 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 删除本地订单
   * Remove local order
   *
   * @param {string} orderId - 订单ID / Order ID
   */
  removeLocalOrder(orderId) { // 调用 removeLocalOrder
    this.localState.orders.delete(orderId); // 访问 localState
  } // 结束代码块

  /**
   * 更新本地仓位
   * Update local position
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} positionData - 仓位数据 / Position data
   */
  updateLocalPosition(symbol, positionData) { // 调用 updateLocalPosition
    this.localState.positions.set(symbol, { // 访问 localState
      ...positionData, // 展开对象或数组
      updatedAt: Date.now(), // 设置 updatedAt 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 删除本地仓位
   * Remove local position
   *
   * @param {string} symbol - 交易对 / Trading pair
   */
  removeLocalPosition(symbol) { // 调用 removeLocalPosition
    this.localState.positions.delete(symbol); // 访问 localState
  } // 结束代码块

  /**
   * 更新本地余额
   * Update local balance
   *
   * @param {string} currency - 货币 / Currency
   * @param {Object} balanceData - 余额数据 / Balance data
   */
  updateLocalBalance(currency, balanceData) { // 调用 updateLocalBalance
    this.localState.balances.set(currency, { // 访问 localState
      ...balanceData, // 展开对象或数组
      updatedAt: Date.now(), // 设置 updatedAt 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录本地成交
   * Record local fill
   *
   * @param {string} fillId - 成交ID / Fill ID
   * @param {Object} fillData - 成交数据 / Fill data
   */
  recordLocalFill(fillId, fillData) { // 调用 recordLocalFill
    this.localState.fills.set(fillId, { // 访问 localState
      ...fillData, // 展开对象或数组
      recordedAt: Date.now(), // 设置 recordedAt 字段
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 同步操作 / Sync Operations
  // ============================================

  /**
   * 执行快速同步
   * Perform quick sync
   * @private
   */
  async _performQuickSync() { // 执行语句
    if (!this.exchangeClient || this.partitionStatus === PARTITION_STATUS.PARTITIONED) { // 条件判断 !this.exchangeClient || this.partitionStatus ...
      return; // 返回结果
    } // 结束代码块

    this.syncStatus = SYNC_STATUS.SYNCING; // 设置 syncStatus

    try { // 尝试执行
      // 只同步活跃订单 / Only sync active orders
      await this._syncOrders(); // 等待异步结果

      this.syncStatus = SYNC_STATUS.SYNCED; // 设置 syncStatus
      this.remoteState.lastSyncTime = Date.now(); // 访问 remoteState

    } catch (error) { // 执行语句
      this.log(`快速同步失败: ${error.message}`, 'error'); // 调用 log
      this.syncStatus = SYNC_STATUS.DIVERGED; // 设置 syncStatus
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行完全同步
   * Perform full sync
   * @private
   */
  async _performFullSync() { // 执行语句
    if (!this.exchangeClient) return; // 条件判断 !this.exchangeClient

    this.syncStatus = SYNC_STATUS.SYNCING; // 设置 syncStatus
    this.log('开始完全同步 / Starting full sync', 'info'); // 调用 log

    try { // 尝试执行
      // 并行同步所有数据 / Sync all data in parallel
      await Promise.all([ // 等待异步结果
        this._syncOrders(), // 调用 _syncOrders
        this._syncPositions(), // 调用 _syncPositions
        this._syncBalances(), // 调用 _syncBalances
      ]); // 结束数组或索引

      // 检查不一致 / Check inconsistencies
      const inconsistencies = this._detectInconsistencies(); // 定义常量 inconsistencies

      if (inconsistencies.length > 0) { // 条件判断 inconsistencies.length > 0
        this.syncStatus = SYNC_STATUS.DIVERGED; // 设置 syncStatus
        this._handleInconsistencies(inconsistencies); // 调用 _handleInconsistencies
      } else { // 执行语句
        this.syncStatus = SYNC_STATUS.SYNCED; // 设置 syncStatus
      } // 结束代码块

      this.remoteState.lastSyncTime = Date.now(); // 访问 remoteState
      this.log('完全同步完成 / Full sync completed', 'info'); // 调用 log

      this.emit('syncCompleted', { // 调用 emit
        status: this.syncStatus, // 设置 status 字段
        inconsistencies: inconsistencies.length, // 设置 inconsistencies 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块

    } catch (error) { // 执行语句
      this.log(`完全同步失败: ${error.message}`, 'error'); // 调用 log
      this.syncStatus = SYNC_STATUS.DIVERGED; // 设置 syncStatus

      this.emit('syncFailed', { // 调用 emit
        error: error.message, // 设置 error 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步订单
   * Sync orders
   * @private
   */
  async _syncOrders() { // 执行语句
    if (!this.exchangeClient) return; // 条件判断 !this.exchangeClient

    try { // 尝试执行
      // 获取远程订单 / Fetch remote orders
      let remoteOrders = []; // 定义变量 remoteOrders

      if (typeof this.exchangeClient.fetchOpenOrders === 'function') { // 条件判断 typeof this.exchangeClient.fetchOpenOrders ==...
        remoteOrders = await this.exchangeClient.fetchOpenOrders(); // 赋值 remoteOrders
      } else if (typeof this.exchangeClient.fetchOrders === 'function') { // 执行语句
        remoteOrders = await this.exchangeClient.fetchOrders(); // 赋值 remoteOrders
      } // 结束代码块

      // 更新远程状态 / Update remote state
      this.remoteState.orders.clear(); // 访问 remoteState
      for (const order of remoteOrders) { // 循环 const order of remoteOrders
        this.remoteState.orders.set(order.id, { // 访问 remoteState
          id: order.id, // 设置 id 字段
          symbol: order.symbol, // 设置 symbol 字段
          side: order.side, // 设置 side 字段
          type: order.type, // 设置 type 字段
          price: order.price, // 设置 price 字段
          amount: order.amount, // 设置 amount 字段
          filled: order.filled, // 设置 filled 字段
          remaining: order.remaining, // 设置 remaining 字段
          status: order.status, // 设置 status 字段
          timestamp: order.timestamp, // 设置 timestamp 字段
        }); // 结束代码块
      } // 结束代码块

    } catch (error) { // 执行语句
      this.log(`订单同步失败: ${error.message}`, 'warn'); // 调用 log
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步仓位
   * Sync positions
   * @private
   */
  async _syncPositions() { // 执行语句
    if (!this.exchangeClient) return; // 条件判断 !this.exchangeClient

    try { // 尝试执行
      // 获取远程仓位 / Fetch remote positions
      let remotePositions = []; // 定义变量 remotePositions

      if (typeof this.exchangeClient.fetchPositions === 'function') { // 条件判断 typeof this.exchangeClient.fetchPositions ===...
        remotePositions = await this.exchangeClient.fetchPositions(); // 赋值 remotePositions
      } else if (typeof this.exchangeClient.fetchBalance === 'function') { // 执行语句
        // 从余额推断仓位 / Infer positions from balance
        const balance = await this.exchangeClient.fetchBalance(); // 定义常量 balance
        if (balance.info && balance.info.positions) { // 条件判断 balance.info && balance.info.positions
          remotePositions = balance.info.positions; // 赋值 remotePositions
        } // 结束代码块
      } // 结束代码块

      // 更新远程状态 / Update remote state
      this.remoteState.positions.clear(); // 访问 remoteState
      for (const position of remotePositions) { // 循环 const position of remotePositions
        const size = position.contracts || position.size || position.amount || 0; // 定义常量 size
        if (Math.abs(size) > 0) { // 条件判断 Math.abs(size) > 0
          this.remoteState.positions.set(position.symbol, { // 访问 remoteState
            symbol: position.symbol, // 设置 symbol 字段
            side: position.side, // 设置 side 字段
            size: size, // 设置 size 字段
            entryPrice: position.entryPrice || position.avgPrice, // 设置 entryPrice 字段
            markPrice: position.markPrice, // 设置 markPrice 字段
            unrealizedPnl: position.unrealizedPnl || position.unrealizedProfit, // 设置 unrealizedPnl 字段
            leverage: position.leverage, // 设置 leverage 字段
            liquidationPrice: position.liquidationPrice, // 设置 liquidationPrice 字段
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

    } catch (error) { // 执行语句
      this.log(`仓位同步失败: ${error.message}`, 'warn'); // 调用 log
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步余额
   * Sync balances
   * @private
   */
  async _syncBalances() { // 执行语句
    if (!this.exchangeClient) return; // 条件判断 !this.exchangeClient

    try { // 尝试执行
      // 获取远程余额 / Fetch remote balances
      let balance = {}; // 定义变量 balance

      if (typeof this.exchangeClient.fetchBalance === 'function') { // 条件判断 typeof this.exchangeClient.fetchBalance === '...
        balance = await this.exchangeClient.fetchBalance(); // 赋值 balance
      } // 结束代码块

      // 更新远程状态 / Update remote state
      this.remoteState.balances.clear(); // 访问 remoteState

      if (balance.total) { // 条件判断 balance.total
        for (const [currency, amount] of Object.entries(balance.total)) { // 循环 const [currency, amount] of Object.entries(ba...
          if (amount > 0) { // 条件判断 amount > 0
            this.remoteState.balances.set(currency, { // 访问 remoteState
              currency, // 执行语句
              total: amount, // 设置 total 字段
              free: balance.free ? balance.free[currency] || 0 : amount, // 设置 free 字段
              used: balance.used ? balance.used[currency] || 0 : 0, // 设置 used 字段
            }); // 结束代码块
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

    } catch (error) { // 执行语句
      this.log(`余额同步失败: ${error.message}`, 'warn'); // 调用 log
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 不一致检测 / Inconsistency Detection
  // ============================================

  /**
   * 检测不一致
   * Detect inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectInconsistencies() { // 调用 _detectInconsistencies
    const inconsistencies = []; // 定义常量 inconsistencies

    // 1. 检测订单不一致 / Detect order inconsistencies
    const orderInconsistencies = this._detectOrderInconsistencies(); // 定义常量 orderInconsistencies
    inconsistencies.push(...orderInconsistencies); // 调用 inconsistencies.push

    // 2. 检测仓位不一致 / Detect position inconsistencies
    const positionInconsistencies = this._detectPositionInconsistencies(); // 定义常量 positionInconsistencies
    inconsistencies.push(...positionInconsistencies); // 调用 inconsistencies.push

    // 3. 检测余额不一致 / Detect balance inconsistencies
    const balanceInconsistencies = this._detectBalanceInconsistencies(); // 定义常量 balanceInconsistencies
    inconsistencies.push(...balanceInconsistencies); // 调用 inconsistencies.push

    return inconsistencies; // 返回结果
  } // 结束代码块

  /**
   * 检测订单不一致
   * Detect order inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectOrderInconsistencies() { // 调用 _detectOrderInconsistencies
    const inconsistencies = []; // 定义常量 inconsistencies

    // 检查本地订单是否在远程存在 / Check if local orders exist remotely
    for (const [orderId, localOrder] of this.localState.orders) { // 循环 const [orderId, localOrder] of this.localStat...
      const remoteOrder = this.remoteState.orders.get(orderId); // 定义常量 remoteOrder

      if (!remoteOrder) { // 条件判断 !remoteOrder
        // 订单在本地存在但远程不存在 / Order exists locally but not remotely
        // 可能已成交或已取消 / May have been filled or cancelled
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.ORDER_MISSING, // 设置 type 字段
          orderId, // 执行语句
          localState: localOrder, // 设置 localState 字段
          remoteState: null, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_ORDER, // 设置 suggestedAction 字段
          severity: 'high', // 设置 severity 字段
          message: `本地订单 ${orderId} 在交易所不存在`, // 设置 message 字段
        }); // 结束代码块
      } else if (this._isOrderStatusDifferent(localOrder, remoteOrder)) { // 执行语句
        // 订单状态不一致 / Order status differs
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.ORDER_STATUS, // 设置 type 字段
          orderId, // 执行语句
          localState: localOrder, // 设置 localState 字段
          remoteState: remoteOrder, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_ORDER, // 设置 suggestedAction 字段
          severity: 'medium', // 设置 severity 字段
          message: `订单 ${orderId} 状态不一致: 本地=${localOrder.status}, 远程=${remoteOrder.status}`, // 设置 message 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查远程订单是否在本地存在 / Check if remote orders exist locally
    for (const [orderId, remoteOrder] of this.remoteState.orders) { // 循环 const [orderId, remoteOrder] of this.remoteSt...
      if (!this.localState.orders.has(orderId)) { // 条件判断 !this.localState.orders.has(orderId)
        // 订单在远程存在但本地不存在 / Order exists remotely but not locally
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.ORDER_EXTRA, // 设置 type 字段
          orderId, // 执行语句
          localState: null, // 设置 localState 字段
          remoteState: remoteOrder, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_ORDER, // 设置 suggestedAction 字段
          severity: 'medium', // 设置 severity 字段
          message: `远程订单 ${orderId} 在本地不存在`, // 设置 message 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return inconsistencies; // 返回结果
  } // 结束代码块

  /**
   * 检测仓位不一致
   * Detect position inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectPositionInconsistencies() { // 调用 _detectPositionInconsistencies
    const inconsistencies = []; // 定义常量 inconsistencies

    // 检查本地仓位 / Check local positions
    for (const [symbol, localPosition] of this.localState.positions) { // 循环 const [symbol, localPosition] of this.localSt...
      const remotePosition = this.remoteState.positions.get(symbol); // 定义常量 remotePosition

      if (!remotePosition) { // 条件判断 !remotePosition
        // 仓位在本地存在但远程不存在 / Position exists locally but not remotely
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.POSITION_MISSING, // 设置 type 字段
          symbol, // 执行语句
          localState: localPosition, // 设置 localState 字段
          remoteState: null, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_POSITION, // 设置 suggestedAction 字段
          severity: 'critical', // 设置 severity 字段
          message: `本地仓位 ${symbol} 在交易所不存在`, // 设置 message 字段
        }); // 结束代码块
      } else if (!this._isPositionSizeEqual(localPosition.size, remotePosition.size)) { // 执行语句
        // 仓位大小不一致 / Position size differs
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.POSITION_SIZE, // 设置 type 字段
          symbol, // 执行语句
          localState: localPosition, // 设置 localState 字段
          remoteState: remotePosition, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_POSITION, // 设置 suggestedAction 字段
          severity: 'critical', // 设置 severity 字段
          message: `仓位 ${symbol} 大小不一致: 本地=${localPosition.size}, 远程=${remotePosition.size}`, // 设置 message 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查远程仓位 / Check remote positions
    for (const [symbol, remotePosition] of this.remoteState.positions) { // 循环 const [symbol, remotePosition] of this.remote...
      if (!this.localState.positions.has(symbol)) { // 条件判断 !this.localState.positions.has(symbol)
        // 仓位在远程存在但本地不存在 / Position exists remotely but not locally
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.POSITION_EXTRA, // 设置 type 字段
          symbol, // 执行语句
          localState: null, // 设置 localState 字段
          remoteState: remotePosition, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_POSITION, // 设置 suggestedAction 字段
          severity: 'critical', // 设置 severity 字段
          message: `远程仓位 ${symbol} 在本地不存在`, // 设置 message 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return inconsistencies; // 返回结果
  } // 结束代码块

  /**
   * 检测余额不一致
   * Detect balance inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectBalanceInconsistencies() { // 调用 _detectBalanceInconsistencies
    const inconsistencies = []; // 定义常量 inconsistencies

    // 检查重要货币的余额 / Check balances for important currencies
    for (const [currency, localBalance] of this.localState.balances) { // 循环 const [currency, localBalance] of this.localS...
      const remoteBalance = this.remoteState.balances.get(currency); // 定义常量 remoteBalance

      if (remoteBalance && !this._isBalanceEqual(localBalance.total, remoteBalance.total)) { // 条件判断 remoteBalance && !this._isBalanceEqual(localB...
        inconsistencies.push({ // 调用 inconsistencies.push
          type: INCONSISTENCY_TYPE.BALANCE_MISMATCH, // 设置 type 字段
          currency, // 执行语句
          localState: localBalance, // 设置 localState 字段
          remoteState: remoteBalance, // 设置 remoteState 字段
          suggestedAction: REPAIR_ACTION.SYNC_BALANCE, // 设置 suggestedAction 字段
          severity: 'medium', // 设置 severity 字段
          message: `余额 ${currency} 不一致: 本地=${localBalance.total}, 远程=${remoteBalance.total}`, // 设置 message 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return inconsistencies; // 返回结果
  } // 结束代码块

  /**
   * 检查订单状态是否不同
   * Check if order status is different
   *
   * @param {Object} local - 本地订单 / Local order
   * @param {Object} remote - 远程订单 / Remote order
   * @returns {boolean} 是否不同 / Whether different
   * @private
   */
  _isOrderStatusDifferent(local, remote) { // 调用 _isOrderStatusDifferent
    // 状态不同 / Status differs
    if (local.status !== remote.status) return true; // 条件判断 local.status !== remote.status

    // 成交量差异超过容差 / Fill amount difference exceeds tolerance
    if (local.filled !== undefined && remote.filled !== undefined) { // 条件判断 local.filled !== undefined && remote.filled !...
      const diff = Math.abs(local.filled - remote.filled); // 定义常量 diff
      const tolerance = local.amount * this.config.positionSizeTolerance; // 定义常量 tolerance
      if (diff > tolerance) return true; // 条件判断 diff > tolerance
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 检查仓位大小是否相等
   * Check if position size is equal
   *
   * @param {number} local - 本地大小 / Local size
   * @param {number} remote - 远程大小 / Remote size
   * @returns {boolean} 是否相等 / Whether equal
   * @private
   */
  _isPositionSizeEqual(local, remote) { // 调用 _isPositionSizeEqual
    const diff = Math.abs(local - remote); // 定义常量 diff
    const max = Math.max(Math.abs(local), Math.abs(remote)); // 定义常量 max
    const tolerance = max * this.config.positionSizeTolerance; // 定义常量 tolerance
    return diff <= tolerance; // 返回结果
  } // 结束代码块

  /**
   * 检查余额是否相等
   * Check if balance is equal
   *
   * @param {number} local - 本地余额 / Local balance
   * @param {number} remote - 远程余额 / Remote balance
   * @returns {boolean} 是否相等 / Whether equal
   * @private
   */
  _isBalanceEqual(local, remote) { // 调用 _isBalanceEqual
    const diff = Math.abs(local - remote); // 定义常量 diff
    const max = Math.max(Math.abs(local), Math.abs(remote)); // 定义常量 max
    const tolerance = max * this.config.balanceTolerance; // 定义常量 tolerance
    return diff <= tolerance; // 返回结果
  } // 结束代码块

  // ============================================
  // 不一致处理 / Inconsistency Handling
  // ============================================

  /**
   * 处理不一致
   * Handle inconsistencies
   *
   * @param {Array} inconsistencies - 不一致列表 / Inconsistency list
   * @private
   */
  _handleInconsistencies(inconsistencies) { // 调用 _handleInconsistencies
    // 记录不一致 / Record inconsistencies
    for (const inconsistency of inconsistencies) { // 循环 const inconsistency of inconsistencies
      this.inconsistencies.push({ // 访问 inconsistencies
        ...inconsistency, // 展开对象或数组
        detectedAt: Date.now(), // 设置 detectedAt 字段
      }); // 结束代码块
    } // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.inconsistencies.length > this.config.historyLength) { // 条件判断 this.inconsistencies.length > this.config.his...
      this.inconsistencies = this.inconsistencies.slice(-this.config.historyLength); // 设置 inconsistencies
    } // 结束代码块

    // 按严重程度分类 / Categorize by severity
    const critical = inconsistencies.filter(i => i.severity === 'critical'); // 定义函数 critical
    const high = inconsistencies.filter(i => i.severity === 'high'); // 定义函数 high

    // 发出事件 / Emit event
    this.emit('inconsistenciesDetected', { // 调用 emit
      total: inconsistencies.length, // 设置 total 字段
      critical: critical.length, // 设置 critical 字段
      high: high.length, // 设置 high 字段
      inconsistencies, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    // 记录日志 / Log
    this.log(`检测到 ${inconsistencies.length} 个不一致 (严重: ${critical.length}, 高: ${high.length})`, 'warn'); // 调用 log

    // 自动修复 / Auto repair
    if (this.config.enableAutoRepair) { // 条件判断 this.config.enableAutoRepair
      this._performAutoRepair(inconsistencies); // 调用 _performAutoRepair
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行自动修复
   * Perform auto repair
   *
   * @param {Array} inconsistencies - 不一致列表 / Inconsistency list
   * @private
   */
  async _performAutoRepair(inconsistencies) { // 执行语句
    for (const inconsistency of inconsistencies) { // 循环 const inconsistency of inconsistencies
      // 需要确认的修复 / Repairs that need confirmation
      if (this.config.confirmBeforeRepair && inconsistency.severity === 'critical') { // 条件判断 this.config.confirmBeforeRepair && inconsiste...
        this.emit('repairRequired', inconsistency); // 调用 emit
        continue; // 继续下一轮循环
      } // 结束代码块

      try { // 尝试执行
        await this._repairInconsistency(inconsistency); // 等待异步结果
      } catch (error) { // 执行语句
        this.log(`修复失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 修复不一致
   * Repair inconsistency
   *
   * @param {Object} inconsistency - 不一致对象 / Inconsistency object
   */
  async _repairInconsistency(inconsistency) { // 执行语句
    const { type, suggestedAction } = inconsistency; // 解构赋值

    let repairResult = { // 定义变量 repairResult
      inconsistency, // 执行语句
      action: suggestedAction, // 设置 action 字段
      success: false, // 设置 success 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    try { // 尝试执行
      switch (suggestedAction) { // 分支选择 suggestedAction
        case REPAIR_ACTION.SYNC_ORDER: // 分支 REPAIR_ACTION.SYNC_ORDER
          await this._syncOrders(); // 等待异步结果
          repairResult.success = true; // 赋值 repairResult.success
          break; // 跳出循环或分支

        case REPAIR_ACTION.SYNC_POSITION: // 分支 REPAIR_ACTION.SYNC_POSITION
          await this._syncPositions(); // 等待异步结果
          // 更新本地仓位状态 / Update local position state
          if (inconsistency.remoteState) { // 条件判断 inconsistency.remoteState
            this.localState.positions.set( // 访问 localState
              inconsistency.symbol, // 执行语句
              { ...inconsistency.remoteState, updatedAt: Date.now() } // 执行语句
            ); // 结束调用或参数
          } else if (inconsistency.type === INCONSISTENCY_TYPE.POSITION_MISSING) { // 执行语句
            // 仓位已不存在，移除本地状态 / Position no longer exists, remove local state
            this.localState.positions.delete(inconsistency.symbol); // 访问 localState
          } // 结束代码块
          repairResult.success = true; // 赋值 repairResult.success
          break; // 跳出循环或分支

        case REPAIR_ACTION.SYNC_BALANCE: // 分支 REPAIR_ACTION.SYNC_BALANCE
          await this._syncBalances(); // 等待异步结果
          // 更新本地余额 / Update local balance
          if (inconsistency.remoteState) { // 条件判断 inconsistency.remoteState
            this.localState.balances.set( // 访问 localState
              inconsistency.currency, // 执行语句
              { ...inconsistency.remoteState, updatedAt: Date.now() } // 执行语句
            ); // 结束调用或参数
          } // 结束代码块
          repairResult.success = true; // 赋值 repairResult.success
          break; // 跳出循环或分支

        case REPAIR_ACTION.FETCH_FILLS: // 分支 REPAIR_ACTION.FETCH_FILLS
          // 获取丢失的成交记录 / Fetch missing fills
          if (this.exchangeClient && typeof this.exchangeClient.fetchMyTrades === 'function') { // 条件判断 this.exchangeClient && typeof this.exchangeCl...
            const trades = await this.exchangeClient.fetchMyTrades(inconsistency.symbol); // 定义常量 trades
            for (const trade of trades) { // 循环 const trade of trades
              this.localState.fills.set(trade.id, trade); // 访问 localState
            } // 结束代码块
          } // 结束代码块
          repairResult.success = true; // 赋值 repairResult.success
          break; // 跳出循环或分支

        case REPAIR_ACTION.CANCEL_ORDER: // 分支 REPAIR_ACTION.CANCEL_ORDER
          // 取消孤立订单 / Cancel orphan order
          if (this.exchangeClient && inconsistency.orderId) { // 条件判断 this.exchangeClient && inconsistency.orderId
            await this.exchangeClient.cancelOrder(inconsistency.orderId); // 等待异步结果
            this.localState.orders.delete(inconsistency.orderId); // 访问 localState
          } // 结束代码块
          repairResult.success = true; // 赋值 repairResult.success
          break; // 跳出循环或分支

        default: // 默认分支
          repairResult.action = REPAIR_ACTION.NO_ACTION; // 赋值 repairResult.action
          repairResult.success = true; // 赋值 repairResult.success
      } // 结束代码块

      // 记录修复历史 / Record repair history
      this.repairHistory.push(repairResult); // 访问 repairHistory

      if (this.repairHistory.length > this.config.historyLength) { // 条件判断 this.repairHistory.length > this.config.histo...
        this.repairHistory.shift(); // 访问 repairHistory
      } // 结束代码块

      this.log(`修复成功: ${type} - ${suggestedAction}`, 'info'); // 调用 log
      this.emit('repairCompleted', repairResult); // 调用 emit

    } catch (error) { // 执行语句
      repairResult.error = error.message; // 赋值 repairResult.error
      this.repairHistory.push(repairResult); // 访问 repairHistory

      this.log(`修复失败: ${error.message}`, 'error'); // 调用 log
      this.emit('repairFailed', repairResult); // 调用 emit
    } // 结束代码块

    return repairResult; // 返回结果
  } // 结束代码块

  // ============================================
  // 心跳检测 / Heartbeat Detection
  // ============================================

  /**
   * 执行心跳检测
   * Perform heartbeat
   * @private
   */
  async _performHeartbeat() { // 执行语句
    if (!this.exchangeClient) return; // 条件判断 !this.exchangeClient

    try { // 尝试执行
      // 尝试获取服务器时间 / Try to get server time
      const startTime = Date.now(); // 定义常量 startTime

      if (typeof this.exchangeClient.fetchTime === 'function') { // 条件判断 typeof this.exchangeClient.fetchTime === 'fun...
        await Promise.race([ // 等待异步结果
          this.exchangeClient.fetchTime(), // 访问 exchangeClient
          new Promise((_, reject) => // 创建 Promise 实例
            setTimeout(() => reject(new Error('心跳超时')), this.config.heartbeatTimeout) // 设置延时任务
          ), // 结束调用或参数
        ]); // 结束数组或索引
      } // 结束代码块

      const latency = Date.now() - startTime; // 定义常量 latency

      // 心跳成功 / Heartbeat success
      this.heartbeatStats.consecutiveFailures = 0; // 访问 heartbeatStats
      this.heartbeatStats.lastSuccessTime = Date.now(); // 访问 heartbeatStats

      // 更新分区状态 / Update partition status
      if (this.partitionStatus !== PARTITION_STATUS.CONNECTED) { // 条件判断 this.partitionStatus !== PARTITION_STATUS.CON...
        this.partitionStatus = PARTITION_STATUS.CONNECTED; // 设置 partitionStatus
        this.emit('reconnected', { latency, timestamp: Date.now() }); // 调用 emit
        this.log('网络连接已恢复 / Network connection recovered', 'info'); // 调用 log
      } // 结束代码块

    } catch (error) { // 执行语句
      // 心跳失败 / Heartbeat failed
      this.heartbeatStats.consecutiveFailures++; // 访问 heartbeatStats
      this.heartbeatStats.lastFailureTime = Date.now(); // 访问 heartbeatStats

      // 检查是否触发分区 / Check if partition is triggered
      if (this.heartbeatStats.consecutiveFailures >= this.config.partitionThreshold) { // 条件判断 this.heartbeatStats.consecutiveFailures >= th...
        if (this.partitionStatus !== PARTITION_STATUS.PARTITIONED) { // 条件判断 this.partitionStatus !== PARTITION_STATUS.PAR...
          this.partitionStatus = PARTITION_STATUS.PARTITIONED; // 设置 partitionStatus
          this.emit('partitioned', { // 调用 emit
            consecutiveFailures: this.heartbeatStats.consecutiveFailures, // 设置 consecutiveFailures 字段
            lastError: error.message, // 设置 lastError 字段
            timestamp: Date.now(), // 设置 timestamp 字段
          }); // 结束代码块
          this.log(`🚨 检测到网络分区: ${error.message}`, 'error'); // 调用 log
        } // 结束代码块
      } else if (this.partitionStatus === PARTITION_STATUS.CONNECTED) { // 执行语句
        this.partitionStatus = PARTITION_STATUS.PARTIAL; // 设置 partitionStatus
        this.emit('partialConnection', { // 调用 emit
          consecutiveFailures: this.heartbeatStats.consecutiveFailures, // 设置 consecutiveFailures 字段
          timestamp: Date.now(), // 设置 timestamp 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 强制同步
   * Force sync
   */
  async forceSync() { // 执行语句
    await this._performFullSync(); // 等待异步结果
  } // 结束代码块

  /**
   * 手动修复
   * Manual repair
   *
   * @param {Object} inconsistency - 不一致对象 / Inconsistency object
   * @returns {Promise<Object>} 修复结果 / Repair result
   */
  async manualRepair(inconsistency) { // 执行语句
    return await this._repairInconsistency(inconsistency); // 返回结果
  } // 结束代码块

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // 设置 running 字段
      syncStatus: this.syncStatus, // 设置 syncStatus 字段
      partitionStatus: this.partitionStatus, // 设置 partitionStatus 字段
      lastSyncTime: this.remoteState.lastSyncTime, // 设置 lastSyncTime 字段
      localOrderCount: this.localState.orders.size, // 设置 localOrderCount 字段
      remoteOrderCount: this.remoteState.orders.size, // 设置 remoteOrderCount 字段
      localPositionCount: this.localState.positions.size, // 设置 localPositionCount 字段
      remotePositionCount: this.remoteState.positions.size, // 设置 remotePositionCount 字段
      inconsistencyCount: this.inconsistencies.length, // 设置 inconsistencyCount 字段
      heartbeatStats: { ...this.heartbeatStats }, // 设置 heartbeatStats 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取不一致列表
   * Get inconsistencies
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 不一致列表 / Inconsistency list
   */
  getInconsistencies(limit = 50) { // 调用 getInconsistencies
    return this.inconsistencies.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取修复历史
   * Get repair history
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 修复历史 / Repair history
   */
  getRepairHistory(limit = 50) { // 调用 getRepairHistory
    return this.repairHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取本地状态
   * Get local state
   *
   * @returns {Object} 本地状态 / Local state
   */
  getLocalState() { // 调用 getLocalState
    return { // 返回结果
      orders: Object.fromEntries(this.localState.orders), // 设置 orders 字段
      positions: Object.fromEntries(this.localState.positions), // 设置 positions 字段
      balances: Object.fromEntries(this.localState.balances), // 设置 balances 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取远程状态
   * Get remote state
   *
   * @returns {Object} 远程状态 / Remote state
   */
  getRemoteState() { // 调用 getRemoteState
    return { // 返回结果
      orders: Object.fromEntries(this.remoteState.orders), // 设置 orders 字段
      positions: Object.fromEntries(this.remoteState.positions), // 设置 positions 字段
      balances: Object.fromEntries(this.remoteState.balances), // 设置 balances 字段
      lastSyncTime: this.remoteState.lastSyncTime, // 设置 lastSyncTime 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 比较状态差异
   * Compare state differences
   *
   * @returns {Object} 状态差异 / State differences
   */
  compareStates() { // 调用 compareStates
    return { // 返回结果
      inconsistencies: this._detectInconsistencies(), // 设置 inconsistencies 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') return; // 条件判断 !this.config.verbose && level === 'info'

    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  SYNC_STATUS, // 执行语句
  INCONSISTENCY_TYPE, // 执行语句
  REPAIR_ACTION, // 执行语句
  PARTITION_STATUS, // 执行语句
  DEFAULT_CONFIG, // 执行语句
}; // 结束代码块
export default NetworkPartitionHandler; // 默认导出
