/**
 * 智能订单执行器
 * Smart Order Executor
 *
 * 功能 / Features:
 * 1. 智能下单（post-only、reduce-only）/ Smart order execution (post-only, reduce-only)
 * 2. 500ms 未成交自动撤单重下 / Auto-cancel and re-submit after 500ms if not filled
 * 3. 处理 429 限频 / Handle 429 rate limiting
 * 4. 处理 nonce 冲突 / Handle nonce conflicts
 * 5. 多账户并行安全 / Multi-account parallel safety
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 UUID 生成器 / Import UUID generator
import { v4 as uuidv4 } from 'uuid';

// 导入并发队列 / Import concurrency queue
import PQueue from 'p-queue';

// 导入线程安全集合 / Import thread-safe collections
import { SafeMap, AsyncLock } from '../utils/SafeCollection.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 订单方向
 * Order side
 */
const SIDE = {
  BUY: 'buy',     // 买入 / Buy
  SELL: 'sell',   // 卖出 / Sell
};

/**
 * 订单类型
 * Order type
 */
const ORDER_TYPE = {
  MARKET: 'market',   // 市价单 / Market order
  LIMIT: 'limit',     // 限价单 / Limit order
  POST_ONLY: 'post_only',   // 只做 Maker / Post-only (maker only)
  IOC: 'ioc',         // 立即成交或取消 / Immediate or cancel
  FOK: 'fok',         // 全部成交或取消 / Fill or kill
};

/**
 * 订单状态
 * Order status
 */
const ORDER_STATUS = {
  PENDING: 'pending',       // 等待提交 / Pending submission
  SUBMITTED: 'submitted',   // 已提交 / Submitted
  PARTIAL: 'partial',       // 部分成交 / Partially filled
  FILLED: 'filled',         // 完全成交 / Fully filled
  CANCELED: 'canceled',     // 已取消 / Canceled
  REJECTED: 'rejected',     // 被拒绝 / Rejected
  EXPIRED: 'expired',       // 已过期 / Expired
  FAILED: 'failed',         // 失败 / Failed
};

/**
 * 错误类型
 * Error types
 */
const ERROR_TYPE = {
  RATE_LIMIT: 'rate_limit',       // 429 限频 / Rate limit (429)
  NONCE_CONFLICT: 'nonce',        // Nonce 冲突 / Nonce conflict
  INSUFFICIENT_BALANCE: 'balance', // 余额不足 / Insufficient balance
  INVALID_ORDER: 'invalid',       // 无效订单 / Invalid order
  NETWORK: 'network',             // 网络错误 / Network error
  EXCHANGE: 'exchange',           // 交易所错误 / Exchange error
  UNKNOWN: 'unknown',             // 未知错误 / Unknown error
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 订单监控配置 / Order Monitoring Configuration
  // ============================================

  // 未成交自动撤单时间 (毫秒) / Auto-cancel time for unfilled orders (ms)
  unfillTimeout: 500,

  // 订单状态检查间隔 (毫秒) / Order status check interval (ms)
  checkInterval: 100,

  // 最大重下次数 / Maximum re-submit attempts
  maxResubmitAttempts: 5,

  // 价格滑点容忍度 / Price slippage tolerance
  priceSlippage: 0.001,  // 0.1%

  // ============================================
  // 限频处理配置 / Rate Limit Configuration
  // ============================================

  // 429 错误初始等待时间 (毫秒) / Initial wait time for 429 errors (ms)
  rateLimitInitialWait: 1000,

  // 429 错误最大等待时间 (毫秒) / Maximum wait time for 429 errors (ms)
  rateLimitMaxWait: 30000,

  // 429 错误退避乘数 / Backoff multiplier for 429 errors
  rateLimitBackoffMultiplier: 2,

  // 429 错误最大重试次数 / Maximum retries for 429 errors
  rateLimitMaxRetries: 5,

  // ============================================
  // Nonce 处理配置 / Nonce Configuration
  // ============================================

  // Nonce 冲突重试次数 / Nonce conflict retry attempts
  nonceRetryAttempts: 3,

  // Nonce 冲突重试延迟 (毫秒) / Nonce conflict retry delay (ms)
  nonceRetryDelay: 100,

  // 时间戳偏移修正 (毫秒) / Timestamp offset correction (ms)
  timestampOffset: 0,

  // ============================================
  // 并发控制配置 / Concurrency Configuration
  // ============================================

  // 每个账户的最大并发订单数 / Max concurrent orders per account
  maxConcurrentPerAccount: 5,

  // 全局最大并发订单数 / Global max concurrent orders
  maxConcurrentGlobal: 20,

  // 订单队列超时 (毫秒) / Order queue timeout (ms)
  queueTimeout: 30000,

  // ============================================
  // 智能下单配置 / Smart Order Configuration
  // ============================================

  // 默认使用 post-only / Default to post-only orders
  defaultPostOnly: false,

  // 自动调整价格使订单成为 Maker / Auto-adjust price to be maker
  autoMakerPrice: true,

  // Maker 价格偏移 (相对于最佳价格) / Maker price offset from best price
  makerPriceOffset: 0.0001,  // 0.01%

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[SmartExecutor]',

  // ============================================
  // DryRun 配置 / DryRun Configuration
  // ============================================

  // 是否启用 dryRun 模式 (影子模式) / Enable dryRun mode (shadow mode)
  // 启用后订单不会真实执行，仅模拟成交
  // When enabled, orders will not be actually executed, only simulated
  dryRun: false,

  // dryRun 模式下的模拟成交延迟 (毫秒) / Simulated fill delay in dryRun mode (ms)
  dryRunFillDelay: 100,

  // dryRun 模式下的滑点模拟 / Slippage simulation in dryRun mode
  dryRunSlippage: 0.0001,  // 0.01%
};

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 账户锁管理器 (线程安全)
 * Account Lock Manager (Thread-Safe)
 *
 * 为每个账户提供独立的互斥锁，确保多账户并行安全
 * Provides independent mutex locks for each account to ensure multi-account parallel safety
 */
class AccountLockManager {
  /**
   * 构造函数
   * Constructor
   */
  constructor() {
    // 使用线程安全的 Map 存储账户锁
    // Use thread-safe Map for account locks
    this.locks = new SafeMap();

    // 全局队列 / Global queue
    this.globalQueue = new PQueue({ concurrency: DEFAULT_CONFIG.maxConcurrentGlobal });

    // 锁，用于创建新账户队列的原子操作
    // Lock for atomic creation of new account queues
    this._creationLock = new AsyncLock();
  }

  /**
   * 获取账户队列 (线程安全)
   * Get account queue (thread-safe)
   *
   * @param {string} accountId - 账户 ID / Account ID
   * @param {number} concurrency - 并发数 / Concurrency
   * @returns {Promise<PQueue>} 账户队列 / Account queue
   */
  async getAccountQueue(accountId, concurrency = DEFAULT_CONFIG.maxConcurrentPerAccount) {
    // 使用 getOrCreate 原子操作
    // Use atomic getOrCreate operation
    const lockInfo = await this.locks.getOrCreate(accountId, async () => {
      // 创建新队列 / Create new queue
      const queue = new PQueue({
        // 设置并发数 / Set concurrency
        concurrency,

        // 设置超时 / Set timeout
        timeout: DEFAULT_CONFIG.queueTimeout,
      });

      // 返回锁信息 / Return lock info
      return {
        // 队列实例 / Queue instance
        queue,

        // 活跃订单计数 / Active order count
        activeCount: 0,

        // 创建时间 / Creation time
        createdAt: Date.now(),
      };
    });

    // 返回队列 / Return queue
    return lockInfo.queue;
  }

  /**
   * 在账户队列中执行任务 (线程安全)
   * Execute task in account queue (thread-safe)
   *
   * @param {string} accountId - 账户 ID / Account ID
   * @param {Function} task - 要执行的任务 / Task to execute
   * @returns {Promise} 任务结果 / Task result
   */
  async executeInQueue(accountId, task) {
    // 获取账户队列 / Get account queue
    const queue = await this.getAccountQueue(accountId);

    // 原子增加活跃计数 / Atomically increment active count
    await this.locks.update(accountId, (lockInfo) => ({
      ...lockInfo,
      activeCount: lockInfo.activeCount + 1,
    }));

    try {
      // 在队列中执行任务 / Execute task in queue
      // 同时受全局队列限制 / Also limited by global queue
      return await this.globalQueue.add(() => queue.add(task));

    } finally {
      // 原子减少活跃计数 / Atomically decrement active count
      await this.locks.update(accountId, (lockInfo) => ({
        ...lockInfo,
        activeCount: lockInfo.activeCount - 1,
      }));
    }
  }

  /**
   * 获取账户状态
   * Get account status
   *
   * @param {string} accountId - 账户 ID / Account ID
   * @returns {Object} 账户状态 / Account status
   */
  getAccountStatus(accountId) {
    // 获取锁信息 / Get lock info
    const lockInfo = this.locks.get(accountId);

    // 如果账户不存在 / If account doesn't exist
    if (!lockInfo) {
      return {
        exists: false,          // 不存在 / Doesn't exist
        activeCount: 0,         // 活跃数 / Active count
        pendingCount: 0,        // 等待数 / Pending count
      };
    }

    // 返回状态 / Return status
    return {
      exists: true,                           // 存在 / Exists
      activeCount: lockInfo.activeCount,      // 活跃数 / Active count
      pendingCount: lockInfo.queue.pending,   // 等待数 / Pending count
      size: lockInfo.queue.size,              // 队列大小 / Queue size
    };
  }

  /**
   * 清理空闲账户 (线程安全)
   * Clean up idle accounts (thread-safe)
   *
   * @param {number} maxIdleTime - 最大空闲时间 (毫秒) / Maximum idle time (ms)
   */
  async cleanupIdleAccounts(maxIdleTime = 300000) {
    // 当前时间 / Current time
    const now = Date.now();

    // 使用安全清理方法 / Use safe cleanup method
    await this.locks.cleanupExpired((lockInfo, accountId) => {
      // 如果没有活跃任务且队列为空且超过空闲时间 / If no active tasks, queue empty, and exceeds idle time
      return lockInfo.activeCount === 0 &&
             lockInfo.queue.size === 0 &&
             now - lockInfo.createdAt > maxIdleTime;
    });
  }
}

/**
 * 限频管理器 (线程安全)
 * Rate Limit Manager (Thread-Safe)
 *
 * 处理 429 错误和限频控制
 * Handles 429 errors and rate limiting
 */
class RateLimitManager {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    // 保存配置 / Save config
    this.config = config;

    // 使用线程安全的 Map 存储交易所限频状态
    // Use thread-safe Map for exchange rate limit status
    this.rateLimitStatus = new SafeMap();
  }

  /**
   * 检查是否被限频
   * Check if rate limited
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @returns {boolean} 是否被限频 / Whether rate limited
   */
  isRateLimited(exchangeId) {
    // 获取限频状态 / Get rate limit status
    const status = this.rateLimitStatus.get(exchangeId);

    // 如果没有状态，未被限频 / If no status, not rate limited
    if (!status) {
      return false;
    }

    // 检查等待时间是否已过 / Check if wait time has passed
    return Date.now() < status.waitUntil;
  }

  /**
   * 获取等待时间
   * Get wait time
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @returns {number} 等待时间 (毫秒) / Wait time (ms)
   */
  getWaitTime(exchangeId) {
    // 获取限频状态 / Get rate limit status
    const status = this.rateLimitStatus.get(exchangeId);

    // 如果没有状态，无需等待 / If no status, no wait needed
    if (!status) {
      return 0;
    }

    // 计算剩余等待时间 / Calculate remaining wait time
    const remaining = status.waitUntil - Date.now();

    // 返回剩余时间（最小为 0）/ Return remaining time (minimum 0)
    return Math.max(0, remaining);
  }

  /**
   * 记录 429 错误 (线程安全)
   * Record 429 error (thread-safe)
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @param {Object} error - 错误对象 / Error object
   */
  async recordRateLimitError(exchangeId, error) {
    // 使用原子操作更新状态 / Use atomic operation to update status
    await this.rateLimitStatus.compute(exchangeId, (key, status) => {
      const current = status || {
        waitUntil: 0,           // 等待截止时间 / Wait until time
        consecutiveErrors: 0,   // 连续错误次数 / Consecutive error count
        lastError: null,        // 最后一次错误 / Last error
      };

      // 增加连续错误计数 / Increment consecutive error count
      const consecutiveErrors = current.consecutiveErrors + 1;

      // 计算等待时间 (指数退避) / Calculate wait time (exponential backoff)
      const waitTime = Math.min(
        this.config.rateLimitInitialWait *
          Math.pow(this.config.rateLimitBackoffMultiplier, consecutiveErrors - 1),
        this.config.rateLimitMaxWait
      );

      return {
        consecutiveErrors,
        lastError: error,
        waitUntil: Date.now() + waitTime,
      };
    });
  }

  /**
   * 清除限频状态 (线程安全)
   * Clear rate limit status (thread-safe)
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   */
  async clearRateLimitStatus(exchangeId) {
    // 使用原子操作更新状态 / Use atomic operation to update status
    await this.rateLimitStatus.updateIfPresent(exchangeId, (status) => ({
      ...status,
      consecutiveErrors: 0,
    }));
  }

  /**
   * 等待限频解除
   * Wait for rate limit to clear
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @returns {Promise<void>}
   */
  async waitForRateLimit(exchangeId) {
    // 获取等待时间 / Get wait time
    const waitTime = this.getWaitTime(exchangeId);

    // 如果需要等待 / If need to wait
    if (waitTime > 0) {
      // 等待指定时间 / Wait for specified time
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Nonce 管理器 (线程安全)
 * Nonce Manager (Thread-Safe)
 *
 * 处理 nonce 冲突和时间戳同步
 * Handles nonce conflicts and timestamp synchronization
 */
class NonceManager {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    // 保存配置 / Save config
    this.config = config;

    // 使用线程安全的 Map 存储每个交易所的 nonce 状态
    // Use thread-safe Map for nonce status per exchange
    this.nonceStatus = new SafeMap();
  }

  /**
   * 获取下一个 nonce (线程安全)
   * Get next nonce (thread-safe)
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @returns {Promise<number>} 下一个 nonce / Next nonce
   */
  async getNextNonce(exchangeId) {
    // 使用原子操作获取并更新 nonce / Use atomic operation to get and update nonce
    const result = await this.nonceStatus.compute(exchangeId, (key, status) => {
      const current = status || {
        lastNonce: 0,           // 最后使用的 nonce / Last used nonce
        timestampOffset: this.config.timestampOffset,  // 时间戳偏移 / Timestamp offset
        serverTime: 0,          // 服务器时间 / Server time
      };

      // 计算新 nonce (基于时间戳) / Calculate new nonce (timestamp based)
      const timestamp = Date.now() + current.timestampOffset;

      // 确保 nonce 递增 / Ensure nonce is increasing
      const newNonce = Math.max(timestamp, current.lastNonce + 1);

      // 返回更新后的状态 / Return updated status
      return {
        ...current,
        lastNonce: newNonce,
      };
    });

    // 返回新 nonce / Return new nonce
    return result.lastNonce;
  }

  /**
   * 更新时间戳偏移 (线程安全)
   * Update timestamp offset (thread-safe)
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @param {number} serverTime - 服务器时间 / Server time
   */
  async updateTimestampOffset(exchangeId, serverTime) {
    // 计算本地时间 / Calculate local time
    const localTime = Date.now();

    // 计算偏移量 / Calculate offset
    const offset = serverTime - localTime;

    // 使用原子操作更新状态 / Use atomic operation to update status
    await this.nonceStatus.compute(exchangeId, (key, status) => {
      const current = status || {
        lastNonce: 0,
        timestampOffset: 0,
        serverTime: 0,
      };

      return {
        ...current,
        timestampOffset: offset,
        serverTime,
      };
    });
  }

  /**
   * 处理 nonce 冲突 (线程安全)
   * Handle nonce conflict (thread-safe)
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @param {Object} error - 错误对象 / Error object
   */
  async handleNonceConflict(exchangeId, error) {
    // 尝试从错误消息中提取服务器时间 / Try to extract server time from error message
    const serverTimeMatch = error.message?.match(/timestamp[:\s]+(\d+)/i);

    // 使用原子操作更新状态 / Use atomic operation to update status
    await this.nonceStatus.compute(exchangeId, (key, status) => {
      if (!status) {
        return {
          lastNonce: 0,
          timestampOffset: 1000,  // 默认增加 1 秒 / Default add 1 second
          serverTime: 0,
        };
      }

      let newOffset = status.timestampOffset;

      if (serverTimeMatch) {
        // 更新时间戳偏移 / Update timestamp offset
        const serverTime = parseInt(serverTimeMatch[1], 10);
        newOffset = serverTime - Date.now();
      } else {
        // 简单增加偏移量 / Simply increase offset
        newOffset += 1000;  // 增加 1 秒 / Add 1 second
      }

      return {
        ...status,
        timestampOffset: newOffset,
        lastNonce: 0,  // 重置最后 nonce / Reset last nonce
      };
    });
  }

  /**
   * 检测是否为 nonce 冲突错误
   * Detect if error is nonce conflict
   *
   * @param {Object} error - 错误对象 / Error object
   * @returns {boolean} 是否为 nonce 冲突 / Whether nonce conflict
   */
  isNonceConflict(error) {
    // 检查错误消息中是否包含 nonce 相关关键词 / Check if error message contains nonce-related keywords
    const errorMessage = (error.message || '').toLowerCase();

    // nonce 冲突关键词列表 / Nonce conflict keywords
    const nonceKeywords = [
      'nonce',           // 通用 nonce / General nonce
      'timestamp',       // 时间戳 / Timestamp
      'recvwindow',      // Binance 接收窗口 / Binance recv window
      'request timestamp', // 请求时间戳 / Request timestamp
      'invalid signature', // 无效签名 (可能由时间问题导致) / Invalid signature (may be caused by time issue)
      'time in force',   // 时间有效期 / Time in force
    ];

    // 检查是否匹配任一关键词 / Check if matches any keyword
    return nonceKeywords.some(keyword => errorMessage.includes(keyword));
  }
}

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 智能订单执行器
 * Smart Order Executor
 */
export class SmartOrderExecutor extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 交易所实例映射 / Exchange instance map
    // 格式: { exchangeId: exchangeInstance }
    // Format: { exchangeId: exchangeInstance }
    this.exchanges = new SafeMap();

    // 账户锁管理器 / Account lock manager
    this.lockManager = new AccountLockManager();

    // 限频管理器 / Rate limit manager
    this.rateLimitManager = new RateLimitManager(this.config);

    // Nonce 管理器 / Nonce manager
    this.nonceManager = new NonceManager(this.config);

    // 使用线程安全的 Map 存储活跃订单
    // Use thread-safe Map for active orders
    this.activeOrders = new SafeMap();

    // 使用线程安全的 Map 存储订单监控定时器
    // Use thread-safe Map for order monitoring timers
    this.orderMonitors = new SafeMap();

    // 统计信息 / Statistics
    this.stats = {
      totalOrders: 0,         // 总订单数 / Total orders
      filledOrders: 0,        // 成交订单数 / Filled orders
      canceledOrders: 0,      // 取消订单数 / Canceled orders
      failedOrders: 0,        // 失败订单数 / Failed orders
      resubmitCount: 0,       // 重下次数 / Resubmit count
      rateLimitHits: 0,       // 限频次数 / Rate limit hits
      nonceConflicts: 0,      // Nonce 冲突次数 / Nonce conflict count
    };

    // 是否运行中 / Whether running
    this.running = false;
  }

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 初始化执行器
   * Initialize executor
   *
   * @param {Map|Object} exchanges - 交易所实例 / Exchange instances
   */
  async init(exchanges) {
    // 处理交易所输入 / Process exchange input
    if (exchanges instanceof Map) {
      // 如果是 Map，逐个设置 / If Map, set one by one
      for (const [id, instance] of exchanges) {
        await this.exchanges.set(id, instance);
      }
    } else if (typeof exchanges === 'object') {
      // 如果是对象，逐个设置 / If object, set one by one
      for (const [id, instance] of Object.entries(exchanges)) {
        await this.exchanges.set(id, instance);
      }
    }

    // 同步各交易所时间 / Sync time with each exchange
    for (const [exchangeId, exchange] of this.exchanges) {
      // 尝试同步时间 / Try to sync time
      await this._syncExchangeTime(exchangeId, exchange);
    }

    // 标记为运行中 / Mark as running
    this.running = true;

    // 记录日志 / Log
    this.log('智能订单执行器初始化完成 / Smart order executor initialized', 'info');
    this.log(`交易所数量: ${this.exchanges.size} / Exchange count: ${this.exchanges.size}`, 'info');
  }

  /**
   * 同步交易所时间
   * Sync exchange time
   *
   * @param {string} exchangeId - 交易所 ID / Exchange ID
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @private
   */
  async _syncExchangeTime(exchangeId, exchange) {
    try {
      // 尝试获取服务器时间 / Try to get server time
      // 某些交易所支持 fetchTime 方法 / Some exchanges support fetchTime method
      if (typeof exchange.fetchTime === 'function') {
        // 获取服务器时间 / Get server time
        const serverTime = await exchange.fetchTime();

        // 更新时间戳偏移 / Update timestamp offset
        this.nonceManager.updateTimestampOffset(exchangeId, serverTime);

        // 记录日志 / Log
        if (this.config.verbose) {
          const offset = serverTime - Date.now();
          this.log(`${exchangeId} 时间偏移: ${offset}ms / Time offset: ${offset}ms`, 'info');
        }
      }
    } catch (error) {
      // 时间同步失败，使用默认偏移 / Time sync failed, use default offset
      this.log(`${exchangeId} 时间同步失败: ${error.message} / Time sync failed`, 'warn');
    }
  }

  /**
   * 停止执行器
   * Stop executor
   */
  async stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 清除所有订单监控 / Clear all order monitors
    for (const [orderId, timerId] of this.orderMonitors) {
      // 清除定时器 / Clear timer
      clearTimeout(timerId);
    }

    // 清空监控映射 / Clear monitor map
    this.orderMonitors.clearSync();

    // 记录日志 / Log
    this.log('智能订单执行器已停止 / Smart order executor stopped', 'info');
  }

  // ============================================
  // 核心订单执行方法 / Core Order Execution Methods
  // ============================================

  /**
   * 执行订单 (统一入口方法)
   * Execute order (unified entry method)
   *
   * 根据订单类型自动路由到相应的执行方法
   * Automatically routes to appropriate execution method based on order type
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @param {string} params.exchangeId - 交易所 ID / Exchange ID
   * @param {string} params.symbol - 交易对 / Symbol
   * @param {string} params.side - 方向 (buy/sell) / Side
   * @param {number} params.amount - 数量 / Amount
   * @param {number} params.price - 价格 (限价单必需) / Price (required for limit)
   * @param {string} params.type - 订单类型 (market/limit) / Order type
   * @param {boolean} params.reduceOnly - 是否 reduce-only / Whether reduce-only
   * @returns {Promise<Object>} 订单结果 / Order result
   */
  async executeOrder(params) {
    // 解构参数 / Destructure parameters
    const { type = 'market', ...orderParams } = params;

    // 链路日志: 执行器收到订单请求 / Chain log: Executor received order request
    this.log(
      `[链路] 执行器收到订单: ${params.exchangeId} ${params.symbol} ${params.side} ` +
      `数量=${params.amount} 类型=${type} / Executor received order`,
      'info'
    );

    try {
      let result;

      // 根据订单类型路由 / Route based on order type
      if (type === 'market') {
        // 市价单 / Market order
        result = await this.executeMarketOrder(orderParams);
      } else {
        // 限价单 / Limit order
        result = await this.executeSmartLimitOrder(orderParams);
      }

      // 链路日志: 订单执行完成 / Chain log: Order execution completed
      if (result.success) {
        this.log(
          `[链路] 订单执行完成: ${params.symbol} ${params.side} ` +
          `成交=${result.orderInfo?.filledAmount || result.exchangeOrder?.filled || 0} ` +
          `均价=${result.orderInfo?.avgPrice || result.exchangeOrder?.average || 'N/A'} / Order completed`,
          'info'
        );
      }

      // 返回结果 / Return result
      return {
        success: result.success || false,
        orderId: result.orderInfo?.exchangeOrderId || result.exchangeOrder?.id,
        ...result,
      };

    } catch (error) {
      // 链路日志: 订单执行异常 / Chain log: Order execution exception
      this.log(
        `[链路] 订单执行异常: ${params.symbol} ${params.side} 错误=${error.message} / Order exception`,
        'error'
      );

      return {
        success: false,
        error: error.message,
        params,
      };
    }
  }

  /**
   * 执行智能限价单
   * Execute smart limit order
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @param {string} params.exchangeId - 交易所 ID / Exchange ID
   * @param {string} params.accountId - 账户 ID / Account ID
   * @param {string} params.symbol - 交易对 / Symbol
   * @param {string} params.side - 方向 (buy/sell) / Side (buy/sell)
   * @param {number} params.amount - 数量 / Amount
   * @param {number} params.price - 价格 / Price
   * @param {boolean} params.postOnly - 是否 post-only / Whether post-only
   * @param {boolean} params.reduceOnly - 是否 reduce-only / Whether reduce-only
   * @param {Object} params.options - 额外选项 / Extra options
   * @returns {Promise<Object>} 订单结果 / Order result
   */
  async executeSmartLimitOrder(params) {
    // 链路日志: 执行限价单 / Chain log: Executing limit order
    this.log(
      `[链路] 执行限价单: ${params.exchangeId} ${params.symbol} ${params.side} ` +
      `数量=${params.amount} 价格=${params.price} / Executing limit order`,
      'info'
    );

    // 解构参数 / Destructure parameters
    const {
      exchangeId,                                      // 交易所 ID / Exchange ID
      accountId = exchangeId,                          // 账户 ID (默认使用交易所 ID) / Account ID (default to exchange ID)
      symbol,                                          // 交易对 / Symbol
      side,                                            // 方向 / Side
      amount,                                          // 数量 / Amount
      price,                                           // 价格 / Price
      postOnly = this.config.defaultPostOnly,          // 是否 post-only / Whether post-only
      reduceOnly = false,                              // 是否 reduce-only / Whether reduce-only
      options = {},                                    // 额外选项 / Extra options
    } = params;

    // 生成订单 ID / Generate order ID
    const clientOrderId = uuidv4();

    // 创建订单信息对象 / Create order info object
    const orderInfo = {
      // 客户端订单 ID / Client order ID
      clientOrderId,

      // 交易所订单 ID (待填充) / Exchange order ID (to be filled)
      exchangeOrderId: null,

      // 交易所 ID / Exchange ID
      exchangeId,

      // 账户 ID / Account ID
      accountId,

      // 交易对 / Symbol
      symbol,

      // 方向 / Side
      side,

      // 数量 / Amount
      amount,

      // 原始价格 / Original price
      originalPrice: price,

      // 当前价格 / Current price
      currentPrice: price,

      // 订单类型 / Order type
      type: postOnly ? ORDER_TYPE.POST_ONLY : ORDER_TYPE.LIMIT,

      // 是否 post-only / Whether post-only
      postOnly,

      // 是否 reduce-only / Whether reduce-only
      reduceOnly,

      // 订单状态 / Order status
      status: ORDER_STATUS.PENDING,

      // 已成交数量 / Filled amount
      filledAmount: 0,

      // 平均成交价 / Average fill price
      avgPrice: 0,

      // 重下次数 / Resubmit count
      resubmitCount: 0,

      // 创建时间 / Creation time
      createdAt: Date.now(),

      // 最后更新时间 / Last update time
      updatedAt: Date.now(),

      // 额外选项 / Extra options
      options,
    };

    // 保存到活跃订单 (线程安全) / Save to active orders (thread-safe)
    this.activeOrders.setSync(clientOrderId, orderInfo);

    // 更新统计 / Update statistics
    this.stats.totalOrders++;

    // 在账户队列中执行 / Execute in account queue
    try {
      // 使用账户锁确保并行安全 / Use account lock to ensure parallel safety
      const result = await this.lockManager.executeInQueue(accountId, async () => {
        // 执行订单 / Execute order
        return await this._executeOrderWithRetry(orderInfo);
      });

      // 返回结果 / Return result
      return result;

    } catch (error) {
      // 更新订单状态为失败 / Update order status to failed
      orderInfo.status = ORDER_STATUS.FAILED;
      orderInfo.error = error.message;
      orderInfo.updatedAt = Date.now();

      // 更新统计 / Update statistics
      this.stats.failedOrders++;

      // 从活跃订单中移除 (线程安全) / Remove from active orders (thread-safe)
      this.activeOrders.deleteSync(clientOrderId);

      // 发出失败事件 / Emit failed event
      this.emit('orderFailed', { orderInfo, error });

      // 抛出错误 / Throw error
      throw error;
    }
  }

  /**
   * 执行市价单
   * Execute market order
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @returns {Promise<Object>} 订单结果 / Order result
   */
  async executeMarketOrder(params) {
    // 链路日志: 执行市价单 / Chain log: Executing market order
    this.log(
      `[链路] 执行市价单: ${params.exchangeId} ${params.symbol} ${params.side} ` +
      `数量=${params.amount} reduceOnly=${params.reduceOnly || false} / Executing market order`,
      'info'
    );

    // 解构参数 / Destructure parameters
    const {
      exchangeId,                       // 交易所 ID / Exchange ID
      accountId = exchangeId,           // 账户 ID / Account ID
      symbol,                           // 交易对 / Symbol
      side,                             // 方向 / Side
      amount,                           // 数量 / Amount
      price = 0,                        // 当前价格 (用于 dryRun 模式) / Current price (for dryRun mode)
      reduceOnly = false,               // 是否 reduce-only / Whether reduce-only
      options = {},                     // 额外选项 / Extra options
    } = params;

    // 生成订单 ID / Generate order ID
    const clientOrderId = uuidv4();

    // 创建订单信息 / Create order info
    const orderInfo = {
      clientOrderId,
      exchangeOrderId: null,
      exchangeId,
      accountId,
      symbol,
      side,
      amount,
      currentPrice: price,              // 当前价格 (用于 dryRun 模式) / Current price (for dryRun mode)
      type: ORDER_TYPE.MARKET,
      reduceOnly,
      status: ORDER_STATUS.PENDING,
      filledAmount: 0,
      avgPrice: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      options,
    };

    // 保存到活跃订单 (线程安全) / Save to active orders (thread-safe)
    this.activeOrders.setSync(clientOrderId, orderInfo);

    // 更新统计 / Update statistics
    this.stats.totalOrders++;

    // 在账户队列中执行 / Execute in account queue
    try {
      // 使用账户锁 / Use account lock
      const result = await this.lockManager.executeInQueue(accountId, async () => {
        // 执行市价单 / Execute market order
        return await this._executeMarketOrderDirect(orderInfo);
      });

      return result;

    } catch (error) {
      // 更新状态为失败 / Update status to failed
      orderInfo.status = ORDER_STATUS.FAILED;
      orderInfo.error = error.message;

      // 更新统计 / Update statistics
      this.stats.failedOrders++;

      // 移除活跃订单 / Remove active order
      this.activeOrders.deleteSync(clientOrderId);

      // 发出事件 / Emit event
      this.emit('orderFailed', { orderInfo, error });

      throw error;
    }
  }

  /**
   * 执行订单 (带重试和错误处理)
   * Execute order (with retry and error handling)
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeOrderWithRetry(orderInfo) {
    // 链路日志: 开始执行订单 (带重试) / Chain log: Start order execution with retry
    this.log(
      `[链路] 开始执行订单(带重试): ${orderInfo.exchangeId} ${orderInfo.symbol} ${orderInfo.side} ` +
      `数量=${orderInfo.amount} 价格=${orderInfo.currentPrice} / Starting order with retry`,
      'info'
    );

    // DryRun 模式: 模拟成交，不真实下单 / DryRun mode: simulate fill, no real order
    // 注意: dryRun 模式不需要真实的交易所连接 / Note: dryRun mode doesn't need real exchange connection
    if (this.config.dryRun) {
      return await this._executeDryRunOrder(orderInfo);
    }

    // 获取交易所实例 / Get exchange instance
    const exchange = this.exchanges.get(orderInfo.exchangeId);

    // 验证交易所存在 / Validate exchange exists
    if (!exchange) {
      throw new Error(`交易所不存在 / Exchange not found: ${orderInfo.exchangeId}`);
    }

    // 重试循环 / Retry loop
    while (orderInfo.resubmitCount <= this.config.maxResubmitAttempts) {
      try {
        // 检查限频状态 / Check rate limit status
        if (this.rateLimitManager.isRateLimited(orderInfo.exchangeId)) {
          // 等待限频解除 / Wait for rate limit to clear
          await this.rateLimitManager.waitForRateLimit(orderInfo.exchangeId);
        }

        // 构建订单参数 / Build order parameters
        const orderParams = this._buildOrderParams(orderInfo);

        // 链路日志: 提交订单到交易所 / Chain log: Submitting order to exchange
        this.log(
          `[链路] 提交订单到交易所: ${orderInfo.symbol} ${orderInfo.side} ` +
          `数量=${orderInfo.amount} 价格=${orderInfo.currentPrice} 重试=${orderInfo.resubmitCount} / Submitting to exchange`,
          'info'
        );

        // 提交订单到交易所 / Submit order to exchange
        const exchangeOrder = await exchange.createOrder(
          orderInfo.symbol,           // 交易对 / Symbol
          orderParams.type,           // 类型 / Type
          orderInfo.side,             // 方向 / Side
          orderInfo.amount,           // 数量 / Amount
          orderInfo.currentPrice,     // 价格 / Price
          orderParams.params          // 额外参数 / Extra params
        );

        // 更新订单信息 / Update order info
        orderInfo.exchangeOrderId = exchangeOrder.id;
        orderInfo.status = ORDER_STATUS.SUBMITTED;
        orderInfo.updatedAt = Date.now();

        // 清除限频状态 / Clear rate limit status
        this.rateLimitManager.clearRateLimitStatus(orderInfo.exchangeId);

        // 发出订单提交事件 / Emit order submitted event
        this.emit('orderSubmitted', { orderInfo, exchangeOrder });

        // 启动订单监控 / Start order monitoring
        this._startOrderMonitor(orderInfo, exchange);

        // 等待订单完成 / Wait for order completion
        const result = await this._waitForOrderCompletion(orderInfo, exchange);

        // 返回结果 / Return result
        return result;

      } catch (error) {
        // 分析错误类型 / Analyze error type
        const errorType = this._analyzeError(error);

        // 根据错误类型处理 / Handle based on error type
        switch (errorType) {
          case ERROR_TYPE.RATE_LIMIT:
            // 记录 429 错误 / Record 429 error
            this.rateLimitManager.recordRateLimitError(orderInfo.exchangeId, error);
            this.stats.rateLimitHits++;

            // 记录日志 / Log
            this.log(`429 限频: ${orderInfo.exchangeId}，等待重试 / Rate limited, waiting to retry`, 'warn');

            // 等待后重试 / Wait and retry
            await this.rateLimitManager.waitForRateLimit(orderInfo.exchangeId);
            continue;

          case ERROR_TYPE.NONCE_CONFLICT:
            // 处理 nonce 冲突 / Handle nonce conflict
            this.nonceManager.handleNonceConflict(orderInfo.exchangeId, error);
            this.stats.nonceConflicts++;

            // 记录日志 / Log
            this.log(`Nonce 冲突: ${orderInfo.exchangeId}，调整后重试 / Nonce conflict, adjusting and retrying`, 'warn');

            // 短暂延迟后重试 / Retry after short delay
            await new Promise(resolve => setTimeout(resolve, this.config.nonceRetryDelay));
            continue;

          case ERROR_TYPE.INSUFFICIENT_BALANCE:
            // 余额不足，直接失败 / Insufficient balance, fail directly
            throw new Error(`余额不足 / Insufficient balance: ${error.message}`);

          case ERROR_TYPE.INVALID_ORDER:
            // 无效订单，直接失败 / Invalid order, fail directly
            throw new Error(`无效订单 / Invalid order: ${error.message}`);

          default:
            // 其他错误，根据重试次数决定 / Other errors, decide based on retry count
            if (orderInfo.resubmitCount >= this.config.maxResubmitAttempts) {
              throw error;
            }

            // 增加重试计数并继续 / Increment retry count and continue
            orderInfo.resubmitCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
        }
      }
    }

    // 超过最大重试次数 / Exceeded max retry attempts
    throw new Error(`订单重试次数超限 / Order retry limit exceeded: ${orderInfo.clientOrderId}`);
  }

  /**
   * 执行 DryRun 订单 (模拟成交)
   * Execute DryRun order (simulated fill)
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @returns {Promise<Object>} 模拟执行结果 / Simulated execution result
   * @private
   */
  async _executeDryRunOrder(orderInfo) {
    // 链路日志: DryRun 模拟订单 / Chain log: DryRun simulating order
    this.log(
      `[链路][DryRun] 模拟订单: ${orderInfo.symbol} ${orderInfo.side} ` +
      `数量=${orderInfo.amount} 价格=${orderInfo.currentPrice} / Simulating order`,
      'info'
    );

    // 模拟网络延迟 / Simulate network delay
    await new Promise(resolve => setTimeout(resolve, this.config.dryRunFillDelay));

    // 计算模拟成交价格 (添加滑点) / Calculate simulated fill price (with slippage)
    const slippageMultiplier = orderInfo.side === SIDE.BUY
      ? (1 + this.config.dryRunSlippage)   // 买入价格略高 / Buy price slightly higher
      : (1 - this.config.dryRunSlippage);  // 卖出价格略低 / Sell price slightly lower

    const simulatedPrice = orderInfo.currentPrice * slippageMultiplier;

    // 生成模拟订单 ID / Generate simulated order ID
    const simulatedOrderId = `dryrun_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 构建模拟交易所订单响应 / Build simulated exchange order response
    const simulatedExchangeOrder = {
      id: simulatedOrderId,
      clientOrderId: orderInfo.clientOrderId,
      symbol: orderInfo.symbol,
      type: orderInfo.type === ORDER_TYPE.MARKET ? 'market' : 'limit',
      side: orderInfo.side,
      amount: orderInfo.amount,
      price: orderInfo.currentPrice,
      average: simulatedPrice,
      filled: orderInfo.amount,
      remaining: 0,
      status: 'closed',
      fee: {
        cost: orderInfo.amount * simulatedPrice * 0.0004,  // 模拟 0.04% 手续费
        currency: 'USDT',
      },
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      info: { dryRun: true },  // 标记为 dryRun 订单
    };

    // 更新订单信息 / Update order info
    orderInfo.exchangeOrderId = simulatedOrderId;
    orderInfo.status = ORDER_STATUS.FILLED;
    orderInfo.filledAmount = orderInfo.amount;
    orderInfo.avgPrice = simulatedPrice;
    orderInfo.updatedAt = Date.now();

    // 更新统计 / Update statistics
    this.stats.filledOrders++;

    // 移除活跃订单 / Remove from active orders
    this.activeOrders.deleteSync(orderInfo.clientOrderId);

    // 发出成交事件 / Emit filled event
    this.emit('orderFilled', { orderInfo, exchangeOrder: simulatedExchangeOrder });

    // 链路日志: DryRun 模拟成交 / Chain log: DryRun simulated fill
    this.log(
      `[链路][DryRun] 模拟成交: ${orderInfo.symbol} ${orderInfo.side} ` +
      `数量=${orderInfo.amount} 均价=${simulatedPrice.toFixed(2)} / Simulated fill`,
      'info'
    );

    // 返回结果 / Return result
    return {
      success: true,
      dryRun: true,
      orderInfo,
      exchangeOrder: simulatedExchangeOrder,
    };
  }

  /**
   * 直接执行市价单
   * Execute market order directly
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeMarketOrderDirect(orderInfo) {
    // 链路日志: 直接执行市价单 / Chain log: Execute market order directly
    this.log(
      `[链路] 直接执行市价单: ${orderInfo.exchangeId} ${orderInfo.symbol} ${orderInfo.side} ` +
      `数量=${orderInfo.amount} / Direct market order execution`,
      'info'
    );

    // DryRun 模式: 模拟成交，不真实下单 / DryRun mode: simulate fill, no real order
    // 注意: dryRun 模式不需要真实的交易所连接 / Note: dryRun mode doesn't need real exchange connection
    if (this.config.dryRun) {
      // 市价单设置类型为 MARKET / Set type to MARKET for market orders
      orderInfo.type = ORDER_TYPE.MARKET;
      return await this._executeDryRunOrder(orderInfo);
    }

    // 获取交易所 / Get exchange
    const exchange = this.exchanges.get(orderInfo.exchangeId);

    if (!exchange) {
      throw new Error(`交易所不存在 / Exchange not found: ${orderInfo.exchangeId}`);
    }

    // 重试循环 / Retry loop
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        // 检查限频 / Check rate limit
        if (this.rateLimitManager.isRateLimited(orderInfo.exchangeId)) {
          await this.rateLimitManager.waitForRateLimit(orderInfo.exchangeId);
        }

        // 构建参数 / Build params
        const params = {};

        // 添加 reduce-only 参数 / Add reduce-only param
        if (orderInfo.reduceOnly) {
          params.reduceOnly = true;
        }

        // 执行市价单 / Execute market order
        const exchangeOrder = await exchange.createOrder(
          orderInfo.symbol,       // 交易对 / Symbol
          'market',               // 类型 / Type
          orderInfo.side,         // 方向 / Side
          orderInfo.amount,       // 数量 / Amount
          undefined,              // 价格 (市价单无需价格) / Price (not needed for market)
          params                  // 参数 / Params
        );

        // 更新订单信息 / Update order info
        orderInfo.exchangeOrderId = exchangeOrder.id;
        orderInfo.status = ORDER_STATUS.FILLED;
        orderInfo.filledAmount = exchangeOrder.filled || orderInfo.amount;
        orderInfo.avgPrice = exchangeOrder.average || exchangeOrder.price;
        orderInfo.updatedAt = Date.now();

        // 清除限频状态 / Clear rate limit status
        this.rateLimitManager.clearRateLimitStatus(orderInfo.exchangeId);

        // 更新统计 / Update statistics
        this.stats.filledOrders++;

        // 移除活跃订单 / Remove from active orders
        this.activeOrders.deleteSync(orderInfo.clientOrderId);

        // 发出成交事件 / Emit filled event
        this.emit('orderFilled', { orderInfo, exchangeOrder });

        // 链路日志: 市价单成交 / Chain log: Market order filled
        this.log(
          `[链路] 市价单成交: ${orderInfo.symbol} ${orderInfo.side} ` +
          `成交=${orderInfo.filledAmount} 均价=${orderInfo.avgPrice} / Market order filled`,
          'info'
        );

        // 返回结果 / Return result
        return {
          success: true,
          orderInfo,
          exchangeOrder,
        };

      } catch (error) {
        // 分析错误 / Analyze error
        const errorType = this._analyzeError(error);

        if (errorType === ERROR_TYPE.RATE_LIMIT) {
          // 限频处理 / Rate limit handling
          this.rateLimitManager.recordRateLimitError(orderInfo.exchangeId, error);
          this.stats.rateLimitHits++;
          await this.rateLimitManager.waitForRateLimit(orderInfo.exchangeId);
          retries++;
          continue;
        }

        if (errorType === ERROR_TYPE.NONCE_CONFLICT) {
          // Nonce 冲突处理 / Nonce conflict handling
          this.nonceManager.handleNonceConflict(orderInfo.exchangeId, error);
          this.stats.nonceConflicts++;
          await new Promise(resolve => setTimeout(resolve, this.config.nonceRetryDelay));
          retries++;
          continue;
        }

        // 其他错误直接抛出 / Other errors, throw directly
        throw error;
      }
    }

    throw new Error(`市价单执行失败 / Market order execution failed: ${orderInfo.clientOrderId}`);
  }

  /**
   * 构建订单参数
   * Build order parameters
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @returns {Object} 订单参数 / Order parameters
   * @private
   */
  _buildOrderParams(orderInfo) {
    // 结果对象 / Result object
    const result = {
      // 订单类型 / Order type
      type: 'limit',

      // 额外参数 / Extra params
      params: {},
    };

    // 添加 post-only 参数 / Add post-only param
    if (orderInfo.postOnly) {
      // 不同交易所的 post-only 参数名可能不同 / Post-only param name varies by exchange
      result.params.postOnly = true;
      result.params.timeInForce = 'PO';  // Binance 使用此参数 / Binance uses this param
    }

    // 添加 reduce-only 参数 / Add reduce-only param
    if (orderInfo.reduceOnly) {
      result.params.reduceOnly = true;
    }

    // 添加客户端订单 ID / Add client order ID
    result.params.clientOrderId = orderInfo.clientOrderId;

    // 合并用户自定义选项 / Merge user custom options
    if (orderInfo.options) {
      Object.assign(result.params, orderInfo.options);
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 启动订单监控
   * Start order monitoring
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @private
   */
  _startOrderMonitor(orderInfo, exchange) {
    // 设置超时定时器 / Set timeout timer
    const timerId = setTimeout(async () => {
      // 检查订单状态 / Check order status
      await this._checkAndResubmitOrder(orderInfo, exchange);
    }, this.config.unfillTimeout);

    // 保存定时器 ID (线程安全) / Save timer ID (thread-safe)
    this.orderMonitors.setSync(orderInfo.clientOrderId, timerId);
  }

  /**
   * 检查并重新提交订单
   * Check and resubmit order
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @private
   */
  async _checkAndResubmitOrder(orderInfo, exchange) {
    // 如果订单已完成或失败，跳过 / If order completed or failed, skip
    if (orderInfo.status === ORDER_STATUS.FILLED ||
        orderInfo.status === ORDER_STATUS.CANCELED ||
        orderInfo.status === ORDER_STATUS.FAILED) {
      return;
    }

    // 检查重下次数 / Check resubmit count
    if (orderInfo.resubmitCount >= this.config.maxResubmitAttempts) {
      // 取消订单 / Cancel order
      await this._cancelOrder(orderInfo, exchange);

      // 更新状态 / Update status
      orderInfo.status = ORDER_STATUS.FAILED;
      orderInfo.error = '超过最大重下次数 / Exceeded max resubmit attempts';

      // 发出事件 / Emit event
      this.emit('orderFailed', { orderInfo, reason: 'max_resubmits' });

      return;
    }

    try {
      // 获取最新订单状态 / Get latest order status
      const latestOrder = await exchange.fetchOrder(orderInfo.exchangeOrderId, orderInfo.symbol);

      // 检查是否已成交 / Check if filled
      if (latestOrder.status === 'closed' || latestOrder.filled === latestOrder.amount) {
        // 已成交，更新状态 / Filled, update status
        orderInfo.status = ORDER_STATUS.FILLED;
        orderInfo.filledAmount = latestOrder.filled;
        orderInfo.avgPrice = latestOrder.average;
        orderInfo.updatedAt = Date.now();

        // 更新统计 / Update statistics
        this.stats.filledOrders++;

        // 移除活跃订单 / Remove active order
        this.activeOrders.deleteSync(orderInfo.clientOrderId);

        // 发出成交事件 / Emit filled event
        this.emit('orderFilled', { orderInfo, exchangeOrder: latestOrder });

        return;
      }

      // 检查是否部分成交 / Check if partially filled
      if (latestOrder.filled > 0) {
        // 更新已成交数量 / Update filled amount
        orderInfo.filledAmount = latestOrder.filled;

        // 计算剩余数量 / Calculate remaining amount
        const remainingAmount = orderInfo.amount - latestOrder.filled;

        // 如果剩余太小，视为完成 / If remaining too small, consider completed
        if (remainingAmount < orderInfo.amount * 0.01) {
          orderInfo.status = ORDER_STATUS.FILLED;
          this.stats.filledOrders++;
          this.activeOrders.deleteSync(orderInfo.clientOrderId);
          this.emit('orderFilled', { orderInfo, exchangeOrder: latestOrder });
          return;
        }

        // 更新数量为剩余数量 / Update amount to remaining
        orderInfo.amount = remainingAmount;
      }

      // 未成交或部分成交，撤单重下 / Not filled or partial, cancel and resubmit
      this.log(
        `订单 ${orderInfo.clientOrderId} 未成交 ${this.config.unfillTimeout}ms，撤单重下 / ` +
        `Order unfilled after ${this.config.unfillTimeout}ms, canceling and resubmitting`,
        'info'
      );

      // 取消当前订单 / Cancel current order
      await this._cancelOrder(orderInfo, exchange);

      // 获取最新价格 / Get latest price
      const newPrice = await this._getNewPrice(orderInfo, exchange);

      // 更新价格 / Update price
      orderInfo.currentPrice = newPrice;

      // 增加重下计数 / Increment resubmit count
      orderInfo.resubmitCount++;
      this.stats.resubmitCount++;

      // 更新时间 / Update time
      orderInfo.updatedAt = Date.now();

      // 发出重下事件 / Emit resubmit event
      this.emit('orderResubmitting', { orderInfo, newPrice });

      // 重新执行订单 / Re-execute order
      await this._executeOrderWithRetry(orderInfo);

    } catch (error) {
      // 记录错误 / Log error
      this.log(`检查订单状态失败: ${error.message} / Failed to check order status`, 'error');

      // 重试检查 / Retry check
      this._startOrderMonitor(orderInfo, exchange);
    }
  }

  /**
   * 等待订单完成
   * Wait for order completion
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @returns {Promise<Object>} 订单结果 / Order result
   * @private
   */
  async _waitForOrderCompletion(orderInfo, exchange) {
    // 返回 Promise / Return Promise
    return new Promise((resolve, reject) => {
      // 检查间隔 / Check interval
      const checkInterval = setInterval(async () => {
        try {
          // 如果订单已完成 / If order completed
          if (orderInfo.status === ORDER_STATUS.FILLED) {
            // 清除定时器 / Clear timer
            clearInterval(checkInterval);

            // 清除监控 / Clear monitor
            this._clearOrderMonitor(orderInfo.clientOrderId);

            // 返回成功 / Return success
            resolve({
              success: true,
              orderInfo,
              status: 'filled',
            });

            return;
          }

          // 如果订单失败 / If order failed
          if (orderInfo.status === ORDER_STATUS.FAILED) {
            // 清除定时器 / Clear timer
            clearInterval(checkInterval);

            // 清除监控 / Clear monitor
            this._clearOrderMonitor(orderInfo.clientOrderId);

            // 返回失败 / Return failure
            reject(new Error(orderInfo.error || '订单失败 / Order failed'));

            return;
          }

          // 继续等待 / Continue waiting

        } catch (error) {
          // 忽略检查错误 / Ignore check errors
        }
      }, this.config.checkInterval);

      // 设置总超时 / Set total timeout
      setTimeout(() => {
        // 清除检查定时器 / Clear check timer
        clearInterval(checkInterval);

        // 如果订单仍在进行中 / If order still in progress
        if (orderInfo.status !== ORDER_STATUS.FILLED &&
            orderInfo.status !== ORDER_STATUS.FAILED) {
          // 返回当前状态 / Return current status
          resolve({
            success: orderInfo.filledAmount > 0,
            orderInfo,
            status: 'timeout',
            filledAmount: orderInfo.filledAmount,
          });
        }
      }, 60000);  // 60 秒总超时 / 60 second total timeout
    });
  }

  /**
   * 取消订单
   * Cancel order
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @private
   */
  async _cancelOrder(orderInfo, exchange) {
    try {
      // 如果有交易所订单 ID / If has exchange order ID
      if (orderInfo.exchangeOrderId) {
        // 取消订单 / Cancel order
        await exchange.cancelOrder(orderInfo.exchangeOrderId, orderInfo.symbol);

        // 记录日志 / Log
        if (this.config.verbose) {
          this.log(
            `已取消订单: ${orderInfo.exchangeOrderId} / Canceled order: ${orderInfo.exchangeOrderId}`,
            'info'
          );
        }
      }

      // 更新统计 / Update statistics
      this.stats.canceledOrders++;

    } catch (error) {
      // 如果订单已经取消或成交，忽略错误 / If order already canceled or filled, ignore error
      if (!error.message.includes('not found') &&
          !error.message.includes('already') &&
          !error.message.includes('filled')) {
        throw error;
      }
    }
  }

  /**
   * 获取新价格
   * Get new price
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Object} exchange - 交易所实例 / Exchange instance
   * @returns {Promise<number>} 新价格 / New price
   * @private
   */
  async _getNewPrice(orderInfo, exchange) {
    try {
      // 获取最新行情 / Get latest ticker
      const ticker = await exchange.fetchTicker(orderInfo.symbol);

      // 根据方向选择价格 / Choose price based on side
      let newPrice;

      if (orderInfo.side === SIDE.BUY) {
        // 买入: 使用卖一价减去偏移 (确保成为 maker) / Buy: use ask price minus offset
        if (orderInfo.postOnly && this.config.autoMakerPrice) {
          // Post-only 模式，确保是 maker / Post-only mode, ensure maker
          newPrice = ticker.bid * (1 + this.config.makerPriceOffset);
        } else {
          // 普通模式，使用卖一价 / Normal mode, use ask price
          newPrice = ticker.ask;
        }
      } else {
        // 卖出: 使用买一价加上偏移 (确保成为 maker) / Sell: use bid price plus offset
        if (orderInfo.postOnly && this.config.autoMakerPrice) {
          // Post-only 模式 / Post-only mode
          newPrice = ticker.ask * (1 - this.config.makerPriceOffset);
        } else {
          // 普通模式 / Normal mode
          newPrice = ticker.bid;
        }
      }

      // 返回新价格 / Return new price
      return newPrice;

    } catch (error) {
      // 获取价格失败，使用原价格加滑点 / Failed to get price, use original with slippage
      const slippage = orderInfo.side === SIDE.BUY
        ? (1 + this.config.priceSlippage)
        : (1 - this.config.priceSlippage);

      return orderInfo.currentPrice * slippage;
    }
  }

  /**
   * 清除订单监控 (线程安全)
   * Clear order monitor (thread-safe)
   *
   * @param {string} clientOrderId - 客户端订单 ID / Client order ID
   * @private
   */
  _clearOrderMonitor(clientOrderId) {
    // 获取定时器 ID / Get timer ID
    const timerId = this.orderMonitors.get(clientOrderId);

    // 如果存在，清除定时器 / If exists, clear timer
    if (timerId) {
      clearTimeout(timerId);
      this.orderMonitors.deleteSync(clientOrderId);
    }
  }

  /**
   * 分析错误类型
   * Analyze error type
   *
   * @param {Object} error - 错误对象 / Error object
   * @returns {string} 错误类型 / Error type
   * @private
   */
  _analyzeError(error) {
    // 获取错误消息 / Get error message
    const message = (error.message || '').toLowerCase();

    // 检查 HTTP 状态码 / Check HTTP status code
    const statusCode = error.status || error.statusCode || error.code;

    // 429 限频 / 429 Rate limit
    if (statusCode === 429 || message.includes('rate limit') || message.includes('too many')) {
      return ERROR_TYPE.RATE_LIMIT;
    }

    // Nonce 冲突 / Nonce conflict
    if (this.nonceManager.isNonceConflict(error)) {
      return ERROR_TYPE.NONCE_CONFLICT;
    }

    // 余额不足 / Insufficient balance
    if (message.includes('insufficient') || message.includes('balance') || message.includes('margin')) {
      return ERROR_TYPE.INSUFFICIENT_BALANCE;
    }

    // 无效订单 / Invalid order
    if (message.includes('invalid') || message.includes('rejected') || message.includes('post only')) {
      return ERROR_TYPE.INVALID_ORDER;
    }

    // 网络错误 / Network error
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ERROR_TYPE.NETWORK;
    }

    // 交易所错误 / Exchange error
    if (message.includes('exchange') || message.includes('server') || message.includes('unavailable')) {
      return ERROR_TYPE.EXCHANGE;
    }

    // 未知错误 / Unknown error
    return ERROR_TYPE.UNKNOWN;
  }

  // ============================================
  // 公共 API / Public API
  // ============================================

  /**
   * 取消指定订单
   * Cancel specific order
   *
   * @param {string} clientOrderId - 客户端订单 ID / Client order ID
   * @returns {Promise<boolean>} 是否成功 / Whether successful
   */
  async cancelOrder(clientOrderId) {
    // 获取订单信息 / Get order info
    const orderInfo = this.activeOrders.get(clientOrderId);

    // 如果订单不存在 / If order doesn't exist
    if (!orderInfo) {
      return false;
    }

    // 获取交易所 / Get exchange
    const exchange = this.exchanges.get(orderInfo.exchangeId);

    // 如果交易所不存在 / If exchange doesn't exist
    if (!exchange) {
      return false;
    }

    try {
      // 取消订单 / Cancel order
      await this._cancelOrder(orderInfo, exchange);

      // 更新状态 / Update status
      orderInfo.status = ORDER_STATUS.CANCELED;
      orderInfo.updatedAt = Date.now();

      // 清除监控 / Clear monitor
      this._clearOrderMonitor(clientOrderId);

      // 移除活跃订单 / Remove active order
      this.activeOrders.deleteSync(clientOrderId);

      // 发出取消事件 / Emit cancel event
      this.emit('orderCanceled', { orderInfo });

      return true;

    } catch (error) {
      // 记录错误 / Log error
      this.log(`取消订单失败: ${error.message} / Failed to cancel order`, 'error');
      return false;
    }
  }

  /**
   * 取消所有订单
   * Cancel all orders
   *
   * @param {string} exchangeId - 交易所 ID (可选) / Exchange ID (optional)
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {Promise<number>} 取消的订单数 / Number of canceled orders
   */
  async cancelAllOrders(exchangeId = null, symbol = null) {
    // 计数器 / Counter
    let canceledCount = 0;

    // 遍历所有活跃订单 / Iterate all active orders
    for (const [clientOrderId, orderInfo] of this.activeOrders) {
      // 检查过滤条件 / Check filter conditions
      if (exchangeId && orderInfo.exchangeId !== exchangeId) {
        continue;
      }

      if (symbol && orderInfo.symbol !== symbol) {
        continue;
      }

      // 取消订单 / Cancel order
      const success = await this.cancelOrder(clientOrderId);

      if (success) {
        canceledCount++;
      }
    }

    // 记录日志 / Log
    this.log(`已取消 ${canceledCount} 个订单 / Canceled ${canceledCount} orders`, 'info');

    // 返回取消数量 / Return canceled count
    return canceledCount;
  }

  /**
   * 获取订单状态
   * Get order status
   *
   * @param {string} clientOrderId - 客户端订单 ID / Client order ID
   * @returns {Object|null} 订单信息 / Order info
   */
  getOrderStatus(clientOrderId) {
    // 返回订单信息副本 / Return copy of order info
    const orderInfo = this.activeOrders.get(clientOrderId);
    return orderInfo ? { ...orderInfo } : null;
  }

  /**
   * 获取所有活跃订单
   * Get all active orders
   *
   * @returns {Array} 活跃订单列表 / Active orders list
   */
  getActiveOrders() {
    // 返回所有活跃订单 / Return all active orders
    return Array.from(this.activeOrders.values()).map(info => ({ ...info }));
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    // 返回统计信息副本 / Return copy of statistics
    return {
      ...this.stats,
      activeOrders: this.activeOrders.size,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取账户状态
   * Get account status
   *
   * @param {string} accountId - 账户 ID / Account ID
   * @returns {Object} 账户状态 / Account status
   */
  getAccountStatus(accountId) {
    return this.lockManager.getAccountStatus(accountId);
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    // 构建完整消息 / Build complete message
    const fullMessage = `${this.config.logPrefix} ${message}`;

    // 根据级别输出 / Output based on level
    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        if (this.config.verbose) {
          console.log(fullMessage);
        }
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  ERROR_TYPE,
  DEFAULT_CONFIG,
};

// 导出辅助类 / Export helper classes
export {
  AccountLockManager,
  RateLimitManager,
  NonceManager,
};

// 默认导出 / Default export
export default SmartOrderExecutor;
