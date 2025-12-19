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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 同步状态
 * Sync status
 */
const SYNC_STATUS = {
  SYNCED: 'synced',             // 已同步 / Synced
  SYNCING: 'syncing',           // 同步中 / Syncing
  DIVERGED: 'diverged',         // 分歧 / Diverged
  UNKNOWN: 'unknown',           // 未知 / Unknown
};

/**
 * 不一致类型
 * Inconsistency type
 */
const INCONSISTENCY_TYPE = {
  ORDER_STATUS: 'order_status',         // 订单状态不一致 / Order status inconsistency
  ORDER_MISSING: 'order_missing',       // 订单丢失 / Order missing
  ORDER_EXTRA: 'order_extra',           // 多余订单 / Extra order
  POSITION_SIZE: 'position_size',       // 仓位大小不一致 / Position size inconsistency
  POSITION_MISSING: 'position_missing', // 仓位丢失 / Position missing
  POSITION_EXTRA: 'position_extra',     // 多余仓位 / Extra position
  BALANCE_MISMATCH: 'balance_mismatch', // 余额不匹配 / Balance mismatch
  FILL_MISSING: 'fill_missing',         // 成交丢失 / Fill missing
};

/**
 * 修复动作
 * Repair action
 */
const REPAIR_ACTION = {
  SYNC_ORDER: 'sync_order',             // 同步订单 / Sync order
  CANCEL_ORDER: 'cancel_order',         // 取消订单 / Cancel order
  SYNC_POSITION: 'sync_position',       // 同步仓位 / Sync position
  CLOSE_POSITION: 'close_position',     // 平仓 / Close position
  SYNC_BALANCE: 'sync_balance',         // 同步余额 / Sync balance
  FETCH_FILLS: 'fetch_fills',           // 获取成交 / Fetch fills
  NO_ACTION: 'no_action',               // 无动作 / No action
};

/**
 * 网络分区状态
 * Network partition status
 */
const PARTITION_STATUS = {
  CONNECTED: 'connected',       // 已连接 / Connected
  PARTIAL: 'partial',           // 部分连接 / Partial connection
  PARTITIONED: 'partitioned',   // 分区 / Partitioned
  RECONNECTING: 'reconnecting', // 重连中 / Reconnecting
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
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
  partitionThreshold: 3,

  // ============================================
  // 修复配置 / Repair Configuration
  // ============================================

  // 启用自动修复 / Enable auto repair
  enableAutoRepair: true,

  // 修复前确认 / Confirm before repair
  confirmBeforeRepair: true,

  // 最大修复尝试次数 / Maximum repair attempts
  maxRepairAttempts: 3,

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[NetworkPartition]',

  // 历史记录保留数量 / History retention count
  historyLength: 500,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 网络分区处理器
 * Network Partition Handler
 */
export class NetworkPartitionHandler extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 本地状态 / Local state
    this.localState = {
      orders: new Map(),        // { orderId: orderData }
      positions: new Map(),     // { symbol: positionData }
      balances: new Map(),      // { currency: balance }
      fills: new Map(),         // { fillId: fillData }
    };

    // 远程状态 (交易所) / Remote state (exchange)
    this.remoteState = {
      orders: new Map(),
      positions: new Map(),
      balances: new Map(),
      fills: new Map(),
      lastSyncTime: null,
    };

    // 同步状态 / Sync status
    this.syncStatus = SYNC_STATUS.UNKNOWN;

    // 网络分区状态 / Network partition status
    this.partitionStatus = PARTITION_STATUS.CONNECTED;

    // 不一致记录 / Inconsistency records
    this.inconsistencies = [];

    // 修复历史 / Repair history
    this.repairHistory = [];

    // 心跳统计 / Heartbeat statistics
    this.heartbeatStats = {
      consecutiveFailures: 0,
      lastSuccessTime: null,
      lastFailureTime: null,
    };

    // 运行状态 / Running state
    this.running = false;

    // 定时器 / Timers
    this.syncCheckTimer = null;
    this.heartbeatTimer = null;
    this.fullSyncTimer = null;

    // 交易所客户端引用 / Exchange client reference
    this.exchangeClient = null;

    // 账户ID / Account ID
    this.accountId = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    const { exchangeClient, accountId } = options;

    this.exchangeClient = exchangeClient;
    this.accountId = accountId || 'default';

    // 执行初始同步 / Perform initial sync
    await this._performFullSync();

    this.log('网络分区处理器初始化完成 / Network partition handler initialized', 'info');
  }

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动同步检查 / Start sync check
    this.syncCheckTimer = setInterval(
      () => this._performQuickSync(),
      this.config.syncCheckInterval
    );

    // 启动心跳检测 / Start heartbeat detection
    this.heartbeatTimer = setInterval(
      () => this._performHeartbeat(),
      this.config.heartbeatInterval
    );

    // 启动完全同步 / Start full sync
    this.fullSyncTimer = setInterval(
      () => this._performFullSync(),
      this.config.forceFullSyncInterval
    );

    this.log('网络分区处理器已启动 / Network partition handler started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.syncCheckTimer) {
      clearInterval(this.syncCheckTimer);
      this.syncCheckTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.fullSyncTimer) {
      clearInterval(this.fullSyncTimer);
      this.fullSyncTimer = null;
    }

    this.log('网络分区处理器已停止 / Network partition handler stopped', 'info');
    this.emit('stopped');
  }

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
  updateLocalOrder(orderId, orderData) {
    this.localState.orders.set(orderId, {
      ...orderData,
      updatedAt: Date.now(),
    });
  }

  /**
   * 删除本地订单
   * Remove local order
   *
   * @param {string} orderId - 订单ID / Order ID
   */
  removeLocalOrder(orderId) {
    this.localState.orders.delete(orderId);
  }

  /**
   * 更新本地仓位
   * Update local position
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} positionData - 仓位数据 / Position data
   */
  updateLocalPosition(symbol, positionData) {
    this.localState.positions.set(symbol, {
      ...positionData,
      updatedAt: Date.now(),
    });
  }

  /**
   * 删除本地仓位
   * Remove local position
   *
   * @param {string} symbol - 交易对 / Trading pair
   */
  removeLocalPosition(symbol) {
    this.localState.positions.delete(symbol);
  }

  /**
   * 更新本地余额
   * Update local balance
   *
   * @param {string} currency - 货币 / Currency
   * @param {Object} balanceData - 余额数据 / Balance data
   */
  updateLocalBalance(currency, balanceData) {
    this.localState.balances.set(currency, {
      ...balanceData,
      updatedAt: Date.now(),
    });
  }

  /**
   * 记录本地成交
   * Record local fill
   *
   * @param {string} fillId - 成交ID / Fill ID
   * @param {Object} fillData - 成交数据 / Fill data
   */
  recordLocalFill(fillId, fillData) {
    this.localState.fills.set(fillId, {
      ...fillData,
      recordedAt: Date.now(),
    });
  }

  // ============================================
  // 同步操作 / Sync Operations
  // ============================================

  /**
   * 执行快速同步
   * Perform quick sync
   * @private
   */
  async _performQuickSync() {
    if (!this.exchangeClient || this.partitionStatus === PARTITION_STATUS.PARTITIONED) {
      return;
    }

    this.syncStatus = SYNC_STATUS.SYNCING;

    try {
      // 只同步活跃订单 / Only sync active orders
      await this._syncOrders();

      this.syncStatus = SYNC_STATUS.SYNCED;
      this.remoteState.lastSyncTime = Date.now();

    } catch (error) {
      this.log(`快速同步失败: ${error.message}`, 'error');
      this.syncStatus = SYNC_STATUS.DIVERGED;
    }
  }

  /**
   * 执行完全同步
   * Perform full sync
   * @private
   */
  async _performFullSync() {
    if (!this.exchangeClient) return;

    this.syncStatus = SYNC_STATUS.SYNCING;
    this.log('开始完全同步 / Starting full sync', 'info');

    try {
      // 并行同步所有数据 / Sync all data in parallel
      await Promise.all([
        this._syncOrders(),
        this._syncPositions(),
        this._syncBalances(),
      ]);

      // 检查不一致 / Check inconsistencies
      const inconsistencies = this._detectInconsistencies();

      if (inconsistencies.length > 0) {
        this.syncStatus = SYNC_STATUS.DIVERGED;
        this._handleInconsistencies(inconsistencies);
      } else {
        this.syncStatus = SYNC_STATUS.SYNCED;
      }

      this.remoteState.lastSyncTime = Date.now();
      this.log('完全同步完成 / Full sync completed', 'info');

      this.emit('syncCompleted', {
        status: this.syncStatus,
        inconsistencies: inconsistencies.length,
        timestamp: Date.now(),
      });

    } catch (error) {
      this.log(`完全同步失败: ${error.message}`, 'error');
      this.syncStatus = SYNC_STATUS.DIVERGED;

      this.emit('syncFailed', {
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 同步订单
   * Sync orders
   * @private
   */
  async _syncOrders() {
    if (!this.exchangeClient) return;

    try {
      // 获取远程订单 / Fetch remote orders
      let remoteOrders = [];

      if (typeof this.exchangeClient.fetchOpenOrders === 'function') {
        remoteOrders = await this.exchangeClient.fetchOpenOrders();
      } else if (typeof this.exchangeClient.fetchOrders === 'function') {
        remoteOrders = await this.exchangeClient.fetchOrders();
      }

      // 更新远程状态 / Update remote state
      this.remoteState.orders.clear();
      for (const order of remoteOrders) {
        this.remoteState.orders.set(order.id, {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          price: order.price,
          amount: order.amount,
          filled: order.filled,
          remaining: order.remaining,
          status: order.status,
          timestamp: order.timestamp,
        });
      }

    } catch (error) {
      this.log(`订单同步失败: ${error.message}`, 'warn');
      throw error;
    }
  }

  /**
   * 同步仓位
   * Sync positions
   * @private
   */
  async _syncPositions() {
    if (!this.exchangeClient) return;

    try {
      // 获取远程仓位 / Fetch remote positions
      let remotePositions = [];

      if (typeof this.exchangeClient.fetchPositions === 'function') {
        remotePositions = await this.exchangeClient.fetchPositions();
      } else if (typeof this.exchangeClient.fetchBalance === 'function') {
        // 从余额推断仓位 / Infer positions from balance
        const balance = await this.exchangeClient.fetchBalance();
        if (balance.info && balance.info.positions) {
          remotePositions = balance.info.positions;
        }
      }

      // 更新远程状态 / Update remote state
      this.remoteState.positions.clear();
      for (const position of remotePositions) {
        const size = position.contracts || position.size || position.amount || 0;
        if (Math.abs(size) > 0) {
          this.remoteState.positions.set(position.symbol, {
            symbol: position.symbol,
            side: position.side,
            size: size,
            entryPrice: position.entryPrice || position.avgPrice,
            markPrice: position.markPrice,
            unrealizedPnl: position.unrealizedPnl || position.unrealizedProfit,
            leverage: position.leverage,
            liquidationPrice: position.liquidationPrice,
          });
        }
      }

    } catch (error) {
      this.log(`仓位同步失败: ${error.message}`, 'warn');
      throw error;
    }
  }

  /**
   * 同步余额
   * Sync balances
   * @private
   */
  async _syncBalances() {
    if (!this.exchangeClient) return;

    try {
      // 获取远程余额 / Fetch remote balances
      let balance = {};

      if (typeof this.exchangeClient.fetchBalance === 'function') {
        balance = await this.exchangeClient.fetchBalance();
      }

      // 更新远程状态 / Update remote state
      this.remoteState.balances.clear();

      if (balance.total) {
        for (const [currency, amount] of Object.entries(balance.total)) {
          if (amount > 0) {
            this.remoteState.balances.set(currency, {
              currency,
              total: amount,
              free: balance.free ? balance.free[currency] || 0 : amount,
              used: balance.used ? balance.used[currency] || 0 : 0,
            });
          }
        }
      }

    } catch (error) {
      this.log(`余额同步失败: ${error.message}`, 'warn');
      throw error;
    }
  }

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
  _detectInconsistencies() {
    const inconsistencies = [];

    // 1. 检测订单不一致 / Detect order inconsistencies
    const orderInconsistencies = this._detectOrderInconsistencies();
    inconsistencies.push(...orderInconsistencies);

    // 2. 检测仓位不一致 / Detect position inconsistencies
    const positionInconsistencies = this._detectPositionInconsistencies();
    inconsistencies.push(...positionInconsistencies);

    // 3. 检测余额不一致 / Detect balance inconsistencies
    const balanceInconsistencies = this._detectBalanceInconsistencies();
    inconsistencies.push(...balanceInconsistencies);

    return inconsistencies;
  }

  /**
   * 检测订单不一致
   * Detect order inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectOrderInconsistencies() {
    const inconsistencies = [];

    // 检查本地订单是否在远程存在 / Check if local orders exist remotely
    for (const [orderId, localOrder] of this.localState.orders) {
      const remoteOrder = this.remoteState.orders.get(orderId);

      if (!remoteOrder) {
        // 订单在本地存在但远程不存在 / Order exists locally but not remotely
        // 可能已成交或已取消 / May have been filled or cancelled
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.ORDER_MISSING,
          orderId,
          localState: localOrder,
          remoteState: null,
          suggestedAction: REPAIR_ACTION.SYNC_ORDER,
          severity: 'high',
          message: `本地订单 ${orderId} 在交易所不存在`,
        });
      } else if (this._isOrderStatusDifferent(localOrder, remoteOrder)) {
        // 订单状态不一致 / Order status differs
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.ORDER_STATUS,
          orderId,
          localState: localOrder,
          remoteState: remoteOrder,
          suggestedAction: REPAIR_ACTION.SYNC_ORDER,
          severity: 'medium',
          message: `订单 ${orderId} 状态不一致: 本地=${localOrder.status}, 远程=${remoteOrder.status}`,
        });
      }
    }

    // 检查远程订单是否在本地存在 / Check if remote orders exist locally
    for (const [orderId, remoteOrder] of this.remoteState.orders) {
      if (!this.localState.orders.has(orderId)) {
        // 订单在远程存在但本地不存在 / Order exists remotely but not locally
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.ORDER_EXTRA,
          orderId,
          localState: null,
          remoteState: remoteOrder,
          suggestedAction: REPAIR_ACTION.SYNC_ORDER,
          severity: 'medium',
          message: `远程订单 ${orderId} 在本地不存在`,
        });
      }
    }

    return inconsistencies;
  }

  /**
   * 检测仓位不一致
   * Detect position inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectPositionInconsistencies() {
    const inconsistencies = [];

    // 检查本地仓位 / Check local positions
    for (const [symbol, localPosition] of this.localState.positions) {
      const remotePosition = this.remoteState.positions.get(symbol);

      if (!remotePosition) {
        // 仓位在本地存在但远程不存在 / Position exists locally but not remotely
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.POSITION_MISSING,
          symbol,
          localState: localPosition,
          remoteState: null,
          suggestedAction: REPAIR_ACTION.SYNC_POSITION,
          severity: 'critical',
          message: `本地仓位 ${symbol} 在交易所不存在`,
        });
      } else if (!this._isPositionSizeEqual(localPosition.size, remotePosition.size)) {
        // 仓位大小不一致 / Position size differs
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.POSITION_SIZE,
          symbol,
          localState: localPosition,
          remoteState: remotePosition,
          suggestedAction: REPAIR_ACTION.SYNC_POSITION,
          severity: 'critical',
          message: `仓位 ${symbol} 大小不一致: 本地=${localPosition.size}, 远程=${remotePosition.size}`,
        });
      }
    }

    // 检查远程仓位 / Check remote positions
    for (const [symbol, remotePosition] of this.remoteState.positions) {
      if (!this.localState.positions.has(symbol)) {
        // 仓位在远程存在但本地不存在 / Position exists remotely but not locally
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.POSITION_EXTRA,
          symbol,
          localState: null,
          remoteState: remotePosition,
          suggestedAction: REPAIR_ACTION.SYNC_POSITION,
          severity: 'critical',
          message: `远程仓位 ${symbol} 在本地不存在`,
        });
      }
    }

    return inconsistencies;
  }

  /**
   * 检测余额不一致
   * Detect balance inconsistencies
   *
   * @returns {Array} 不一致列表 / Inconsistency list
   * @private
   */
  _detectBalanceInconsistencies() {
    const inconsistencies = [];

    // 检查重要货币的余额 / Check balances for important currencies
    for (const [currency, localBalance] of this.localState.balances) {
      const remoteBalance = this.remoteState.balances.get(currency);

      if (remoteBalance && !this._isBalanceEqual(localBalance.total, remoteBalance.total)) {
        inconsistencies.push({
          type: INCONSISTENCY_TYPE.BALANCE_MISMATCH,
          currency,
          localState: localBalance,
          remoteState: remoteBalance,
          suggestedAction: REPAIR_ACTION.SYNC_BALANCE,
          severity: 'medium',
          message: `余额 ${currency} 不一致: 本地=${localBalance.total}, 远程=${remoteBalance.total}`,
        });
      }
    }

    return inconsistencies;
  }

  /**
   * 检查订单状态是否不同
   * Check if order status is different
   *
   * @param {Object} local - 本地订单 / Local order
   * @param {Object} remote - 远程订单 / Remote order
   * @returns {boolean} 是否不同 / Whether different
   * @private
   */
  _isOrderStatusDifferent(local, remote) {
    // 状态不同 / Status differs
    if (local.status !== remote.status) return true;

    // 成交量差异超过容差 / Fill amount difference exceeds tolerance
    if (local.filled !== undefined && remote.filled !== undefined) {
      const diff = Math.abs(local.filled - remote.filled);
      const tolerance = local.amount * this.config.positionSizeTolerance;
      if (diff > tolerance) return true;
    }

    return false;
  }

  /**
   * 检查仓位大小是否相等
   * Check if position size is equal
   *
   * @param {number} local - 本地大小 / Local size
   * @param {number} remote - 远程大小 / Remote size
   * @returns {boolean} 是否相等 / Whether equal
   * @private
   */
  _isPositionSizeEqual(local, remote) {
    const diff = Math.abs(local - remote);
    const max = Math.max(Math.abs(local), Math.abs(remote));
    const tolerance = max * this.config.positionSizeTolerance;
    return diff <= tolerance;
  }

  /**
   * 检查余额是否相等
   * Check if balance is equal
   *
   * @param {number} local - 本地余额 / Local balance
   * @param {number} remote - 远程余额 / Remote balance
   * @returns {boolean} 是否相等 / Whether equal
   * @private
   */
  _isBalanceEqual(local, remote) {
    const diff = Math.abs(local - remote);
    const max = Math.max(Math.abs(local), Math.abs(remote));
    const tolerance = max * this.config.balanceTolerance;
    return diff <= tolerance;
  }

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
  _handleInconsistencies(inconsistencies) {
    // 记录不一致 / Record inconsistencies
    for (const inconsistency of inconsistencies) {
      this.inconsistencies.push({
        ...inconsistency,
        detectedAt: Date.now(),
      });
    }

    // 限制历史长度 / Limit history length
    if (this.inconsistencies.length > this.config.historyLength) {
      this.inconsistencies = this.inconsistencies.slice(-this.config.historyLength);
    }

    // 按严重程度分类 / Categorize by severity
    const critical = inconsistencies.filter(i => i.severity === 'critical');
    const high = inconsistencies.filter(i => i.severity === 'high');

    // 发出事件 / Emit event
    this.emit('inconsistenciesDetected', {
      total: inconsistencies.length,
      critical: critical.length,
      high: high.length,
      inconsistencies,
      timestamp: Date.now(),
    });

    // 记录日志 / Log
    this.log(`检测到 ${inconsistencies.length} 个不一致 (严重: ${critical.length}, 高: ${high.length})`, 'warn');

    // 自动修复 / Auto repair
    if (this.config.enableAutoRepair) {
      this._performAutoRepair(inconsistencies);
    }
  }

  /**
   * 执行自动修复
   * Perform auto repair
   *
   * @param {Array} inconsistencies - 不一致列表 / Inconsistency list
   * @private
   */
  async _performAutoRepair(inconsistencies) {
    for (const inconsistency of inconsistencies) {
      // 需要确认的修复 / Repairs that need confirmation
      if (this.config.confirmBeforeRepair && inconsistency.severity === 'critical') {
        this.emit('repairRequired', inconsistency);
        continue;
      }

      try {
        await this._repairInconsistency(inconsistency);
      } catch (error) {
        this.log(`修复失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 修复不一致
   * Repair inconsistency
   *
   * @param {Object} inconsistency - 不一致对象 / Inconsistency object
   */
  async _repairInconsistency(inconsistency) {
    const { type, suggestedAction } = inconsistency;

    let repairResult = {
      inconsistency,
      action: suggestedAction,
      success: false,
      timestamp: Date.now(),
    };

    try {
      switch (suggestedAction) {
        case REPAIR_ACTION.SYNC_ORDER:
          await this._syncOrders();
          repairResult.success = true;
          break;

        case REPAIR_ACTION.SYNC_POSITION:
          await this._syncPositions();
          // 更新本地仓位状态 / Update local position state
          if (inconsistency.remoteState) {
            this.localState.positions.set(
              inconsistency.symbol,
              { ...inconsistency.remoteState, updatedAt: Date.now() }
            );
          } else if (inconsistency.type === INCONSISTENCY_TYPE.POSITION_MISSING) {
            // 仓位已不存在，移除本地状态 / Position no longer exists, remove local state
            this.localState.positions.delete(inconsistency.symbol);
          }
          repairResult.success = true;
          break;

        case REPAIR_ACTION.SYNC_BALANCE:
          await this._syncBalances();
          // 更新本地余额 / Update local balance
          if (inconsistency.remoteState) {
            this.localState.balances.set(
              inconsistency.currency,
              { ...inconsistency.remoteState, updatedAt: Date.now() }
            );
          }
          repairResult.success = true;
          break;

        case REPAIR_ACTION.FETCH_FILLS:
          // 获取丢失的成交记录 / Fetch missing fills
          if (this.exchangeClient && typeof this.exchangeClient.fetchMyTrades === 'function') {
            const trades = await this.exchangeClient.fetchMyTrades(inconsistency.symbol);
            for (const trade of trades) {
              this.localState.fills.set(trade.id, trade);
            }
          }
          repairResult.success = true;
          break;

        case REPAIR_ACTION.CANCEL_ORDER:
          // 取消孤立订单 / Cancel orphan order
          if (this.exchangeClient && inconsistency.orderId) {
            await this.exchangeClient.cancelOrder(inconsistency.orderId);
            this.localState.orders.delete(inconsistency.orderId);
          }
          repairResult.success = true;
          break;

        default:
          repairResult.action = REPAIR_ACTION.NO_ACTION;
          repairResult.success = true;
      }

      // 记录修复历史 / Record repair history
      this.repairHistory.push(repairResult);

      if (this.repairHistory.length > this.config.historyLength) {
        this.repairHistory.shift();
      }

      this.log(`修复成功: ${type} - ${suggestedAction}`, 'info');
      this.emit('repairCompleted', repairResult);

    } catch (error) {
      repairResult.error = error.message;
      this.repairHistory.push(repairResult);

      this.log(`修复失败: ${error.message}`, 'error');
      this.emit('repairFailed', repairResult);
    }

    return repairResult;
  }

  // ============================================
  // 心跳检测 / Heartbeat Detection
  // ============================================

  /**
   * 执行心跳检测
   * Perform heartbeat
   * @private
   */
  async _performHeartbeat() {
    if (!this.exchangeClient) return;

    try {
      // 尝试获取服务器时间 / Try to get server time
      const startTime = Date.now();

      if (typeof this.exchangeClient.fetchTime === 'function') {
        await Promise.race([
          this.exchangeClient.fetchTime(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('心跳超时')), this.config.heartbeatTimeout)
          ),
        ]);
      }

      const latency = Date.now() - startTime;

      // 心跳成功 / Heartbeat success
      this.heartbeatStats.consecutiveFailures = 0;
      this.heartbeatStats.lastSuccessTime = Date.now();

      // 更新分区状态 / Update partition status
      if (this.partitionStatus !== PARTITION_STATUS.CONNECTED) {
        this.partitionStatus = PARTITION_STATUS.CONNECTED;
        this.emit('reconnected', { latency, timestamp: Date.now() });
        this.log('网络连接已恢复 / Network connection recovered', 'info');
      }

    } catch (error) {
      // 心跳失败 / Heartbeat failed
      this.heartbeatStats.consecutiveFailures++;
      this.heartbeatStats.lastFailureTime = Date.now();

      // 检查是否触发分区 / Check if partition is triggered
      if (this.heartbeatStats.consecutiveFailures >= this.config.partitionThreshold) {
        if (this.partitionStatus !== PARTITION_STATUS.PARTITIONED) {
          this.partitionStatus = PARTITION_STATUS.PARTITIONED;
          this.emit('partitioned', {
            consecutiveFailures: this.heartbeatStats.consecutiveFailures,
            lastError: error.message,
            timestamp: Date.now(),
          });
          this.log(`🚨 检测到网络分区: ${error.message}`, 'error');
        }
      } else if (this.partitionStatus === PARTITION_STATUS.CONNECTED) {
        this.partitionStatus = PARTITION_STATUS.PARTIAL;
        this.emit('partialConnection', {
          consecutiveFailures: this.heartbeatStats.consecutiveFailures,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 强制同步
   * Force sync
   */
  async forceSync() {
    await this._performFullSync();
  }

  /**
   * 手动修复
   * Manual repair
   *
   * @param {Object} inconsistency - 不一致对象 / Inconsistency object
   * @returns {Promise<Object>} 修复结果 / Repair result
   */
  async manualRepair(inconsistency) {
    return await this._repairInconsistency(inconsistency);
  }

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      syncStatus: this.syncStatus,
      partitionStatus: this.partitionStatus,
      lastSyncTime: this.remoteState.lastSyncTime,
      localOrderCount: this.localState.orders.size,
      remoteOrderCount: this.remoteState.orders.size,
      localPositionCount: this.localState.positions.size,
      remotePositionCount: this.remoteState.positions.size,
      inconsistencyCount: this.inconsistencies.length,
      heartbeatStats: { ...this.heartbeatStats },
    };
  }

  /**
   * 获取不一致列表
   * Get inconsistencies
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 不一致列表 / Inconsistency list
   */
  getInconsistencies(limit = 50) {
    return this.inconsistencies.slice(-limit);
  }

  /**
   * 获取修复历史
   * Get repair history
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 修复历史 / Repair history
   */
  getRepairHistory(limit = 50) {
    return this.repairHistory.slice(-limit);
  }

  /**
   * 获取本地状态
   * Get local state
   *
   * @returns {Object} 本地状态 / Local state
   */
  getLocalState() {
    return {
      orders: Object.fromEntries(this.localState.orders),
      positions: Object.fromEntries(this.localState.positions),
      balances: Object.fromEntries(this.localState.balances),
    };
  }

  /**
   * 获取远程状态
   * Get remote state
   *
   * @returns {Object} 远程状态 / Remote state
   */
  getRemoteState() {
    return {
      orders: Object.fromEntries(this.remoteState.orders),
      positions: Object.fromEntries(this.remoteState.positions),
      balances: Object.fromEntries(this.remoteState.balances),
      lastSyncTime: this.remoteState.lastSyncTime,
    };
  }

  /**
   * 比较状态差异
   * Compare state differences
   *
   * @returns {Object} 状态差异 / State differences
   */
  compareStates() {
    return {
      inconsistencies: this._detectInconsistencies(),
      timestamp: Date.now(),
    };
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') return;

    const fullMessage = `${this.config.logPrefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        console.log(fullMessage);
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  SYNC_STATUS,
  INCONSISTENCY_TYPE,
  REPAIR_ACTION,
  PARTITION_STATUS,
  DEFAULT_CONFIG,
};
export default NetworkPartitionHandler;
