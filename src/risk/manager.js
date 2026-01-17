/**
 * 高级风险管理器
 * Advanced Risk Manager
 *
 * 功能 / Features:
 * 1. 总保证金率 < 35% 紧急全平 / Emergency close when margin rate < 35%
 * 2. 单币种仓位 > 15% 报警 / Alert when single symbol position > 15%
 * 3. 当日回撤 > 8% 暂停交易 / Pause trading when daily drawdown > 8%
 * 4. BTC 急跌时自动减仓山寨币 / Auto-deleverage altcoins when BTC crashes
 * 5. 实时计算强平价格 / Real-time liquidation price calculation
 *
 * 所有风控触发后调用 executor.emergencyCloseAll()
 * All risk triggers call executor.emergencyCloseAll()
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入高精度计算 / Import high precision calculation
import Decimal from 'decimal.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 风控级别
 * Risk level
 */
const RISK_LEVEL = {
  NORMAL: 'normal',         // 正常 / Normal
  WARNING: 'warning',       // 警告 / Warning
  DANGER: 'danger',         // 危险 / Danger
  CRITICAL: 'critical',     // 严重 / Critical
  EMERGENCY: 'emergency',   // 紧急 / Emergency
};

/**
 * 风控动作
 * Risk action
 */
const RISK_ACTION = {
  NONE: 'none',                     // 无动作 / No action
  ALERT: 'alert',                   // 报警 / Alert
  REDUCE_POSITION: 'reduce',        // 减仓 / Reduce position
  PAUSE_TRADING: 'pause',           // 暂停交易 / Pause trading
  EMERGENCY_CLOSE: 'emergency',     // 紧急平仓 / Emergency close
};

/**
 * 持仓方向
 * Position side
 */
const POSITION_SIDE = {
  LONG: 'long',     // 多头 / Long
  SHORT: 'short',   // 空头 / Short
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 保证金率配置 / Margin Rate Configuration
  // ============================================

  // 紧急全平保证金率阈值 (35% = 0.35) / Emergency close margin rate threshold
  emergencyMarginRate: 0.35,

  // 警告保证金率阈值 (50% = 0.50) / Warning margin rate threshold
  warningMarginRate: 0.50,

  // 危险保证金率阈值 (40% = 0.40) / Danger margin rate threshold
  dangerMarginRate: 0.40,

  // ============================================
  // 仓位集中度配置 / Position Concentration Configuration
  // ============================================

  // 单币种最大仓位占比 (15% = 0.15) / Max single symbol position ratio
  maxSinglePositionRatio: 0.15,

  // 仓位集中度警告阈值 (10% = 0.10) / Position concentration warning threshold
  positionWarningRatio: 0.10,

  // ============================================
  // 回撤配置 / Drawdown Configuration
  // ============================================

  // 当日最大回撤暂停交易阈值 (8% = 0.08) / Max daily drawdown to pause trading
  maxDailyDrawdown: 0.08,

  // 回撤警告阈值 (5% = 0.05) / Drawdown warning threshold
  drawdownWarningThreshold: 0.05,

  // ============================================
  // 净值回撤配置 / Equity Drawdown Configuration
  // (从历史最高点计算，不随日期重置)
  // (Calculated from all-time high, does not reset daily)
  // ============================================

  // 净值最大回撤阈值 (20% = 0.20) / Max equity drawdown threshold
  // 触发紧急全平 / Triggers emergency close
  maxEquityDrawdown: 0.20,

  // 净值回撤危险阈值 (15% = 0.15) / Equity drawdown danger threshold
  // 触发减仓 / Triggers position reduction
  equityDrawdownDangerThreshold: 0.15,

  // 净值回撤警告阈值 (10% = 0.10) / Equity drawdown warning threshold
  // 暂停新开仓 / Pauses new positions
  equityDrawdownWarningThreshold: 0.10,

  // 净值回撤提醒阈值 (5% = 0.05) / Equity drawdown alert threshold
  // 发出警报 / Emits alert
  equityDrawdownAlertThreshold: 0.05,

  // 是否启用净值回撤监控 / Enable equity drawdown monitoring
  enableEquityDrawdownMonitor: true,

  // 净值回撤减仓比例 (30% = 0.30) / Equity drawdown reduction ratio
  equityDrawdownReduceRatio: 0.30,

  // ============================================
  // BTC 急跌配置 / BTC Crash Configuration
  // ============================================

  // BTC 急跌阈值 (5分钟跌幅) / BTC crash threshold (5-minute drop)
  btcCrashThreshold: -0.03,  // -3%

  // BTC 急跌时山寨币减仓比例 / Altcoin reduction ratio on BTC crash
  altcoinReduceRatio: 0.50,  // 50%

  // BTC 价格检查窗口 (毫秒) / BTC price check window (ms)
  btcPriceWindow: 5 * 60 * 1000,  // 5分钟 / 5 minutes

  // 山寨币列表 (非 BTC 的币) / Altcoin list (non-BTC coins)
  // 留空表示除 BTC 外都是山寨 / Empty means all except BTC are altcoins
  altcoinSymbols: [],

  // ============================================
  // 强平价格配置 / Liquidation Price Configuration
  // ============================================

  // 维持保证金率 / Maintenance margin rate
  maintenanceMarginRate: 0.004,  // 0.4%

  // 强平缓冲距离 (触发预警) / Liquidation buffer distance (trigger warning)
  liquidationBuffer: 0.05,  // 5%

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 风控检查间隔 (毫秒) / Risk check interval (ms)
  checkInterval: 1000,  // 1秒 / 1 second

  // 保证金刷新间隔 (毫秒) / Margin refresh interval (ms)
  marginRefreshInterval: 5000,  // 5秒 / 5 seconds

  // 价格刷新间隔 (毫秒) / Price refresh interval (ms)
  priceRefreshInterval: 1000,  // 1秒 / 1 second

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[RiskMgr]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 高级风险管理器
 * Advanced Risk Manager
 */
export class AdvancedRiskManager extends EventEmitter {
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
    // 格式: { exchangeName: exchangeInstance }
    // Format: { exchangeName: exchangeInstance }
    this.exchanges = new Map();

    // 订单执行器引用 / Order executor reference
    // 用于调用 emergencyCloseAll()
    // For calling emergencyCloseAll()
    this.executor = null;

    // 账户数据缓存 / Account data cache
    // 格式: { exchangeName: { balance, equity, margin, ... } }
    // Format: { exchangeName: { balance, equity, margin, ... } }
    this.accountData = new Map();

    // 持仓数据缓存 / Position data cache
    // 格式: { exchangeName: { symbol: position } }
    // Format: { exchangeName: { symbol: position } }
    this.positionData = new Map();

    // 价格数据缓存 / Price data cache
    // 格式: { symbol: { price, timestamp } }
    // Format: { symbol: { price, timestamp } }
    this.priceData = new Map();

    // BTC 历史价格 (用于计算急跌) / BTC price history (for crash detection)
    // 格式: [{ price, timestamp }, ...]
    // Format: [{ price, timestamp }, ...]
    this.btcPriceHistory = [];

    // 当日权益记录 / Daily equity record
    this.dailyEquity = {
      // 今日起始权益 / Today's starting equity
      startEquity: 0,

      // 今日最高权益 / Today's peak equity
      peakEquity: 0,

      // 今日开始时间戳 / Today's start timestamp
      dayStart: this._getDayStart(),

      // 当前回撤 / Current drawdown
      currentDrawdown: 0,
    };

    // 净值回撤监控 (历史最高点) / Equity drawdown monitoring (all-time high)
    // 不随日期重置 / Does not reset daily
    this.equityDrawdown = {
      // 历史最高净值 / All-time high equity
      allTimeHighEquity: 0,

      // 历史最高净值时间 / All-time high timestamp
      allTimeHighTime: 0,

      // 当前净值回撤 / Current equity drawdown
      currentDrawdown: 0,

      // 当前净值回撤金额 / Current equity drawdown amount
      currentDrawdownAmount: 0,

      // 最大净值回撤 (历史) / Maximum equity drawdown (historical)
      maxDrawdown: 0,

      // 最大净值回撤时间 / Maximum drawdown timestamp
      maxDrawdownTime: 0,

      // 最后更新时间 / Last update time
      lastUpdateTime: 0,

      // 回撤触发次数统计 / Drawdown trigger counts
      triggerCounts: {
        alert: 0,      // 提醒次数 / Alert count
        warning: 0,    // 警告次数 / Warning count
        danger: 0,     // 危险次数 / Danger count
        emergency: 0,  // 紧急次数 / Emergency count
      },
    };

    // 风控状态 / Risk state
    this.state = {
      // 当前风险级别 / Current risk level
      riskLevel: RISK_LEVEL.NORMAL,

      // 是否允许交易 / Whether trading is allowed
      tradingAllowed: true,

      // 暂停交易原因 / Pause trading reason
      pauseReason: null,

      // 风控触发历史 / Risk trigger history
      triggers: [],

      // 最近一次检查时间 / Last check time
      lastCheckTime: 0,

      // 是否正在运行 / Whether running
      running: false,
    };

    // 定时器引用 / Timer references
    this.checkTimer = null;        // 风控检查定时器 / Risk check timer
    this.marginTimer = null;       // 保证金刷新定时器 / Margin refresh timer
    this.priceTimer = null;        // 价格刷新定时器 / Price refresh timer

    // 强平价格缓存 / Liquidation price cache
    // 格式: { symbol: { longLiqPrice, shortLiqPrice, ... } }
    // Format: { symbol: { longLiqPrice, shortLiqPrice, ... } }
    this.liquidationPrices = new Map();
  }

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 初始化风控管理器
   * Initialize risk manager
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   * @param {Object} executor - 订单执行器 / Order executor
   */
  async init(exchanges, executor) {
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges;

    // 保存执行器引用 / Save executor reference
    this.executor = executor;

    // 初始化账户数据 / Initialize account data
    await this._refreshAccountData();

    // 初始化持仓数据 / Initialize position data
    await this._refreshPositionData();

    // 初始化今日权益 / Initialize daily equity
    this._initDailyEquity();

    // 记录日志 / Log
    this.log('风控管理器初始化完成 / Risk manager initialized', 'info');
    this.log(`保证金率阈值: ${(this.config.emergencyMarginRate * 100).toFixed(0)}%`, 'info');
    this.log(`单币种仓位阈值: ${(this.config.maxSinglePositionRatio * 100).toFixed(0)}%`, 'info');
    this.log(`每日回撤阈值: ${(this.config.maxDailyDrawdown * 100).toFixed(0)}%`, 'info');

    // 净值回撤日志 / Equity drawdown log
    if (this.config.enableEquityDrawdownMonitor) {
      this.log(`净值回撤监控: 已启用`, 'info');
      this.log(`  - 提醒阈值: ${(this.config.equityDrawdownAlertThreshold * 100).toFixed(0)}%`, 'info');
      this.log(`  - 警告阈值: ${(this.config.equityDrawdownWarningThreshold * 100).toFixed(0)}%`, 'info');
      this.log(`  - 危险阈值: ${(this.config.equityDrawdownDangerThreshold * 100).toFixed(0)}%`, 'info');
      this.log(`  - 紧急阈值: ${(this.config.maxEquityDrawdown * 100).toFixed(0)}%`, 'info');
    } else {
      this.log(`净值回撤监控: 已禁用`, 'info');
    }
  }

  /**
   * 启动风控监控
   * Start risk monitoring
   */
  start() {
    // 标记为运行中 / Mark as running
    this.state.running = true;

    // 启动风控检查定时器 / Start risk check timer
    this.checkTimer = setInterval(
      () => this._performRiskCheck(),
      this.config.checkInterval
    );

    // 启动保证金刷新定时器 / Start margin refresh timer
    this.marginTimer = setInterval(
      () => this._refreshAccountData(),
      this.config.marginRefreshInterval
    );

    // 启动价格刷新定时器 / Start price refresh timer
    this.priceTimer = setInterval(
      () => this._refreshPrices(),
      this.config.priceRefreshInterval
    );

    // 记录日志 / Log
    this.log('风控监控已启动 / Risk monitoring started', 'info');

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止风控监控
   * Stop risk monitoring
   */
  stop() {
    // 标记为停止 / Mark as stopped
    this.state.running = false;

    // 清除所有定时器 / Clear all timers
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.marginTimer) {
      clearInterval(this.marginTimer);
      this.marginTimer = null;
    }

    if (this.priceTimer) {
      clearInterval(this.priceTimer);
      this.priceTimer = null;
    }

    // 记录日志 / Log
    this.log('风控监控已停止 / Risk monitoring stopped', 'info');

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  // ============================================
  // 核心风控检查 / Core Risk Checks
  // ============================================

  /**
   * 执行完整风控检查
   * Perform complete risk check
   * @private
   */
  async _performRiskCheck() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.state.running) {
      return;
    }

    // 更新检查时间 / Update check time
    this.state.lastCheckTime = Date.now();

    // 检查是否跨天 / Check if crossed day
    this._checkDayReset();

    // 执行各项风控检查 / Perform individual risk checks
    // 按优先级顺序执行 / Execute in priority order

    // 1. 检查保证金率 (最高优先级) / Check margin rate (highest priority)
    const marginResult = await this._checkMarginRate();
    if (marginResult.action === RISK_ACTION.EMERGENCY_CLOSE) {
      // 触发紧急全平 / Trigger emergency close
      await this._triggerEmergencyClose('保证金率过低 / Margin rate too low', marginResult);
      return;
    }

    // 2. 检查净值回撤 (历史最高点) / Check equity drawdown (all-time high)
    const equityDrawdownResult = this._checkEquityDrawdown();
    if (equityDrawdownResult.action === RISK_ACTION.EMERGENCY_CLOSE) {
      // 触发紧急全平 / Trigger emergency close
      await this._triggerEmergencyClose('净值回撤超限 / Equity drawdown exceeded', equityDrawdownResult);
      return;
    }
    if (equityDrawdownResult.action === RISK_ACTION.REDUCE_POSITION) {
      // 触发减仓 / Trigger position reduction
      await this._reducePositionsForEquityDrawdown(equityDrawdownResult);
    }
    if (equityDrawdownResult.action === RISK_ACTION.PAUSE_TRADING) {
      // 暂停新开仓 / Pause new positions
      this._pauseTrading('净值回撤警告 / Equity drawdown warning', equityDrawdownResult);
    }

    // 3. 检查每日回撤 / Check daily drawdown
    const drawdownResult = this._checkDailyDrawdown();
    if (drawdownResult.action === RISK_ACTION.PAUSE_TRADING) {
      // 暂停交易 / Pause trading
      this._pauseTrading('每日回撤超限 / Daily drawdown exceeded', drawdownResult);
    }

    // 4. 检查 BTC 急跌 / Check BTC crash
    const btcCrashResult = this._checkBtcCrash();
    if (btcCrashResult.action === RISK_ACTION.REDUCE_POSITION) {
      // 减仓山寨币 / Reduce altcoin positions
      await this._reduceAltcoinPositions(btcCrashResult);
    }

    // 5. 检查仓位集中度 / Check position concentration
    const concentrationResult = this._checkPositionConcentration();
    if (concentrationResult.action === RISK_ACTION.ALERT) {
      // 发出警报 / Emit alert
      this._emitAlert('仓位集中度过高 / Position concentration too high', concentrationResult);
    }

    // 6. 更新强平价格 / Update liquidation prices
    this._updateLiquidationPrices();

    // 7. 检查强平风险 / Check liquidation risk
    const liquidationResult = this._checkLiquidationRisk();
    if (liquidationResult.action === RISK_ACTION.ALERT) {
      // 发出强平预警 / Emit liquidation warning
      this._emitAlert('接近强平价格 / Near liquidation price', liquidationResult);
    }

    // 更新整体风险级别 / Update overall risk level
    this._updateRiskLevel();
  }

  /**
   * 检查保证金率
   * Check margin rate
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  async _checkMarginRate() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'marginRate',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // 当前保证金率 / Current margin rate
      marginRate: 0,

      // 阈值 / Threshold
      threshold: this.config.emergencyMarginRate,

      // 交易所详情 / Exchange details
      details: [],
    };

    // 计算总保证金率 / Calculate total margin rate
    // 保证金率 = 权益 / 已用保证金 = equity / usedMargin
    // Margin rate = equity / used margin
    let totalEquity = 0;       // 总权益 / Total equity
    let totalUsedMargin = 0;   // 总已用保证金 / Total used margin

    // 遍历所有交易所账户 / Iterate all exchange accounts
    for (const [exchangeName, accountInfo] of this.accountData) {
      // 累加权益 / Accumulate equity
      totalEquity += accountInfo.equity || 0;

      // 累加已用保证金 / Accumulate used margin
      totalUsedMargin += accountInfo.usedMargin || 0;

      // 计算单交易所保证金率 / Calculate single exchange margin rate
      const exchangeMarginRate = accountInfo.usedMargin > 0
        ? accountInfo.equity / accountInfo.usedMargin
        : Infinity;

      // 记录详情 / Record details
      result.details.push({
        exchange: exchangeName,
        equity: accountInfo.equity,
        usedMargin: accountInfo.usedMargin,
        marginRate: exchangeMarginRate,
      });
    }

    // 计算总保证金率 / Calculate total margin rate
    const marginRate = totalUsedMargin > 0
      ? totalEquity / totalUsedMargin
      : Infinity;

    // 保存结果 / Save result
    result.marginRate = marginRate;

    // 判断风险级别和动作 / Determine risk level and action
    if (marginRate < this.config.emergencyMarginRate) {
      // 紧急全平 / Emergency close
      result.action = RISK_ACTION.EMERGENCY_CLOSE;
      result.level = RISK_LEVEL.EMERGENCY;

      // 记录日志 / Log
      this.log(
        `⚠️ 保证金率过低: ${(marginRate * 100).toFixed(2)}% < ${(this.config.emergencyMarginRate * 100).toFixed(0)}%，触发紧急全平`,
        'error'
      );

    } else if (marginRate < this.config.dangerMarginRate) {
      // 危险级别 / Danger level
      result.action = RISK_ACTION.ALERT;
      result.level = RISK_LEVEL.DANGER;

      // 记录日志 / Log
      this.log(
        `⚠️ 保证金率危险: ${(marginRate * 100).toFixed(2)}% < ${(this.config.dangerMarginRate * 100).toFixed(0)}%`,
        'warn'
      );

    } else if (marginRate < this.config.warningMarginRate) {
      // 警告级别 / Warning level
      result.action = RISK_ACTION.ALERT;
      result.level = RISK_LEVEL.WARNING;

      // 记录日志 / Log
      if (this.config.verbose) {
        this.log(
          `保证金率偏低: ${(marginRate * 100).toFixed(2)}% < ${(this.config.warningMarginRate * 100).toFixed(0)}%`,
          'warn'
        );
      }

    } else {
      // 正常 / Normal
      result.level = RISK_LEVEL.NORMAL;
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 检查仓位集中度
   * Check position concentration
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkPositionConcentration() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'positionConcentration',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // 超标币种列表 / Exceeded symbols list
      exceededSymbols: [],

      // 阈值 / Threshold
      threshold: this.config.maxSinglePositionRatio,
    };

    // 计算总仓位价值 / Calculate total position value
    let totalPositionValue = 0;

    // 单币种仓位价值映射 / Single symbol position value map
    const symbolValues = new Map();

    // 遍历所有交易所持仓 / Iterate all exchange positions
    for (const [exchangeName, positions] of this.positionData) {
      // 遍历该交易所的持仓 / Iterate positions on this exchange
      for (const [symbol, position] of Object.entries(positions)) {
        // 计算仓位价值 / Calculate position value
        // 仓位价值 = 数量 × 标记价格
        // Position value = size × mark price
        const positionValue = Math.abs(position.notional || position.contracts * position.markPrice || 0);

        // 累加总仓位价值 / Accumulate total position value
        totalPositionValue += positionValue;

        // 提取基础币种 / Extract base symbol
        // 例如 BTC/USDT:USDT -> BTC / e.g., BTC/USDT:USDT -> BTC
        const baseSymbol = symbol.split('/')[0];

        // 累加同币种仓位 / Accumulate same symbol positions
        const currentValue = symbolValues.get(baseSymbol) || 0;
        symbolValues.set(baseSymbol, currentValue + positionValue);
      }
    }

    // 如果没有仓位，直接返回 / If no positions, return directly
    if (totalPositionValue === 0) {
      return result;
    }

    // 检查每个币种的集中度 / Check concentration for each symbol
    for (const [symbol, value] of symbolValues) {
      // 计算占比 / Calculate ratio
      const ratio = value / totalPositionValue;

      // 如果超过最大阈值 / If exceeds max threshold
      if (ratio > this.config.maxSinglePositionRatio) {
        // 添加到超标列表 / Add to exceeded list
        result.exceededSymbols.push({
          symbol,
          value,
          ratio,
          threshold: this.config.maxSinglePositionRatio,
        });

        // 设置动作为警报 / Set action to alert
        result.action = RISK_ACTION.ALERT;

        // 记录日志 / Log
        this.log(
          `⚠️ 仓位集中度过高: ${symbol} 占比 ${(ratio * 100).toFixed(2)}% > ${(this.config.maxSinglePositionRatio * 100).toFixed(0)}%`,
          'warn'
        );

      } else if (ratio > this.config.positionWarningRatio && this.config.verbose) {
        // 警告级别 / Warning level
        this.log(
          `仓位集中度提醒: ${symbol} 占比 ${(ratio * 100).toFixed(2)}%`,
          'info'
        );
      }
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 检查每日回撤
   * Check daily drawdown
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkDailyDrawdown() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'dailyDrawdown',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // 当前回撤 / Current drawdown
      drawdown: 0,

      // 阈值 / Threshold
      threshold: this.config.maxDailyDrawdown,

      // 今日起始权益 / Today's start equity
      startEquity: this.dailyEquity.startEquity,

      // 今日最高权益 / Today's peak equity
      peakEquity: this.dailyEquity.peakEquity,

      // 当前权益 / Current equity
      currentEquity: 0,
    };

    // 计算当前总权益 / Calculate current total equity
    let currentEquity = 0;
    for (const [, accountInfo] of this.accountData) {
      currentEquity += accountInfo.equity || 0;
    }

    // 保存当前权益 / Save current equity
    result.currentEquity = currentEquity;

    // 更新最高权益 / Update peak equity
    if (currentEquity > this.dailyEquity.peakEquity) {
      this.dailyEquity.peakEquity = currentEquity;
    }

    // 计算回撤 / Calculate drawdown
    // 回撤 = (最高权益 - 当前权益) / 最高权益
    // Drawdown = (peak equity - current equity) / peak equity
    const drawdown = this.dailyEquity.peakEquity > 0
      ? (this.dailyEquity.peakEquity - currentEquity) / this.dailyEquity.peakEquity
      : 0;

    // 保存回撤 / Save drawdown
    result.drawdown = drawdown;
    this.dailyEquity.currentDrawdown = drawdown;

    // 判断风险级别和动作 / Determine risk level and action
    if (drawdown > this.config.maxDailyDrawdown) {
      // 暂停交易 / Pause trading
      result.action = RISK_ACTION.PAUSE_TRADING;
      result.level = RISK_LEVEL.DANGER;

      // 记录日志 / Log
      this.log(
        `⚠️ 当日回撤超限: ${(drawdown * 100).toFixed(2)}% > ${(this.config.maxDailyDrawdown * 100).toFixed(0)}%，暂停交易`,
        'error'
      );

    } else if (drawdown > this.config.drawdownWarningThreshold) {
      // 警告级别 / Warning level
      result.action = RISK_ACTION.ALERT;
      result.level = RISK_LEVEL.WARNING;

      // 记录日志 / Log
      this.log(
        `当日回撤警告: ${(drawdown * 100).toFixed(2)}% > ${(this.config.drawdownWarningThreshold * 100).toFixed(0)}%`,
        'warn'
      );

    } else {
      // 正常 / Normal
      result.level = RISK_LEVEL.NORMAL;
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 检查净值回撤 (从历史最高点计算)
   * Check equity drawdown (calculated from all-time high)
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkEquityDrawdown() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'equityDrawdown',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // 当前回撤 / Current drawdown
      drawdown: 0,

      // 回撤金额 / Drawdown amount
      drawdownAmount: 0,

      // 历史最高净值 / All-time high equity
      allTimeHighEquity: this.equityDrawdown.allTimeHighEquity,

      // 当前权益 / Current equity
      currentEquity: 0,

      // 阈值 / Threshold
      threshold: this.config.maxEquityDrawdown,
    };

    // 如果未启用净值回撤监控，跳过 / If equity drawdown monitoring disabled, skip
    if (!this.config.enableEquityDrawdownMonitor) {
      return result;
    }

    // 计算当前总权益 / Calculate current total equity
    let currentEquity = 0;
    for (const [, accountInfo] of this.accountData) {
      currentEquity += accountInfo.equity || 0;
    }

    // 保存当前权益 / Save current equity
    result.currentEquity = currentEquity;

    // 如果当前权益为0，跳过 / If current equity is 0, skip
    if (currentEquity <= 0) {
      return result;
    }

    // 更新历史最高净值 / Update all-time high equity
    if (currentEquity > this.equityDrawdown.allTimeHighEquity) {
      this.equityDrawdown.allTimeHighEquity = currentEquity;
      this.equityDrawdown.allTimeHighTime = Date.now();
      result.allTimeHighEquity = currentEquity;

      // 创新高时重置回撤 / Reset drawdown on new high
      this.equityDrawdown.currentDrawdown = 0;
      this.equityDrawdown.currentDrawdownAmount = 0;
    }

    // 计算回撤 / Calculate drawdown
    // 回撤 = (历史最高 - 当前权益) / 历史最高
    // Drawdown = (all-time high - current equity) / all-time high
    const drawdown = this.equityDrawdown.allTimeHighEquity > 0
      ? (this.equityDrawdown.allTimeHighEquity - currentEquity) / this.equityDrawdown.allTimeHighEquity
      : 0;

    const drawdownAmount = this.equityDrawdown.allTimeHighEquity - currentEquity;

    // 保存回撤 / Save drawdown
    result.drawdown = drawdown;
    result.drawdownAmount = drawdownAmount;
    this.equityDrawdown.currentDrawdown = drawdown;
    this.equityDrawdown.currentDrawdownAmount = drawdownAmount;
    this.equityDrawdown.lastUpdateTime = Date.now();

    // 更新最大历史回撤 / Update maximum historical drawdown
    if (drawdown > this.equityDrawdown.maxDrawdown) {
      this.equityDrawdown.maxDrawdown = drawdown;
      this.equityDrawdown.maxDrawdownTime = Date.now();
    }

    // 判断风险级别和动作 / Determine risk level and action
    if (drawdown >= this.config.maxEquityDrawdown) {
      // 紧急全平 / Emergency close
      result.action = RISK_ACTION.EMERGENCY_CLOSE;
      result.level = RISK_LEVEL.EMERGENCY;
      this.equityDrawdown.triggerCounts.emergency++;

      // 记录日志 / Log
      this.log(
        `🚨 净值回撤触发紧急全平: ${(drawdown * 100).toFixed(2)}% >= ${(this.config.maxEquityDrawdown * 100).toFixed(0)}% (损失 ${drawdownAmount.toFixed(2)} USDT)`,
        'error'
      );

    } else if (drawdown >= this.config.equityDrawdownDangerThreshold) {
      // 危险 - 触发减仓 / Danger - trigger position reduction
      result.action = RISK_ACTION.REDUCE_POSITION;
      result.level = RISK_LEVEL.DANGER;
      this.equityDrawdown.triggerCounts.danger++;

      // 记录日志 / Log
      this.log(
        `⚠️ 净值回撤危险: ${(drawdown * 100).toFixed(2)}% >= ${(this.config.equityDrawdownDangerThreshold * 100).toFixed(0)}%，触发减仓`,
        'error'
      );

    } else if (drawdown >= this.config.equityDrawdownWarningThreshold) {
      // 警告 - 暂停新开仓 / Warning - pause new positions
      result.action = RISK_ACTION.PAUSE_TRADING;
      result.level = RISK_LEVEL.WARNING;
      this.equityDrawdown.triggerCounts.warning++;

      // 记录日志 / Log
      this.log(
        `⚠️ 净值回撤警告: ${(drawdown * 100).toFixed(2)}% >= ${(this.config.equityDrawdownWarningThreshold * 100).toFixed(0)}%，暂停新开仓`,
        'warn'
      );

    } else if (drawdown >= this.config.equityDrawdownAlertThreshold) {
      // 提醒 / Alert
      result.action = RISK_ACTION.ALERT;
      result.level = RISK_LEVEL.WARNING;
      this.equityDrawdown.triggerCounts.alert++;

      // 记录日志 (仅详细模式) / Log (verbose mode only)
      if (this.config.verbose) {
        this.log(
          `净值回撤提醒: ${(drawdown * 100).toFixed(2)}% (历史最高: ${this.equityDrawdown.allTimeHighEquity.toFixed(2)} USDT)`,
          'warn'
        );
      }

    } else {
      // 正常 / Normal
      result.level = RISK_LEVEL.NORMAL;
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 检查 BTC 急跌
   * Check BTC crash
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkBtcCrash() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'btcCrash',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // BTC 涨跌幅 / BTC change
      btcChange: 0,

      // 阈值 / Threshold
      threshold: this.config.btcCrashThreshold,

      // 窗口时间 / Window time
      windowMs: this.config.btcPriceWindow,
    };

    // 获取 BTC 当前价格 / Get BTC current price
    const btcPrice = this.priceData.get('BTC/USDT') || this.priceData.get('BTCUSDT');

    // 如果没有 BTC 价格数据，跳过 / If no BTC price data, skip
    if (!btcPrice) {
      return result;
    }

    // 当前时间 / Current time
    const now = Date.now();

    // 添加到历史记录 / Add to history
    this.btcPriceHistory.push({
      price: btcPrice.price,
      timestamp: now,
    });

    // 清理过期的历史数据 / Clean up expired history data
    const windowStart = now - this.config.btcPriceWindow;
    this.btcPriceHistory = this.btcPriceHistory.filter(p => p.timestamp >= windowStart);

    // 如果历史数据不足，跳过 / If insufficient history, skip
    if (this.btcPriceHistory.length < 2) {
      return result;
    }

    // 获取窗口内最早的价格 / Get earliest price in window
    const oldestPrice = this.btcPriceHistory[0].price;

    // 获取当前价格 / Get current price
    const currentPrice = btcPrice.price;

    // 计算涨跌幅 / Calculate change
    // 涨跌幅 = (当前价格 - 最早价格) / 最早价格
    // Change = (current price - oldest price) / oldest price
    const btcChange = (currentPrice - oldestPrice) / oldestPrice;

    // 保存涨跌幅 / Save change
    result.btcChange = btcChange;

    // 判断是否急跌 / Check if crash
    if (btcChange < this.config.btcCrashThreshold) {
      // 触发山寨币减仓 / Trigger altcoin reduction
      result.action = RISK_ACTION.REDUCE_POSITION;
      result.level = RISK_LEVEL.DANGER;

      // 记录日志 / Log
      this.log(
        `⚠️ BTC 急跌检测: ${(btcChange * 100).toFixed(2)}% (${(this.config.btcPriceWindow / 60000).toFixed(0)}分钟内)，触发山寨币减仓`,
        'error'
      );

    } else if (btcChange < this.config.btcCrashThreshold / 2) {
      // 警告级别 / Warning level
      result.level = RISK_LEVEL.WARNING;

      // 记录日志 / Log
      if (this.config.verbose) {
        this.log(
          `BTC 下跌警告: ${(btcChange * 100).toFixed(2)}%`,
          'warn'
        );
      }

    } else {
      // 正常 / Normal
      result.level = RISK_LEVEL.NORMAL;
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 检查强平风险
   * Check liquidation risk
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkLiquidationRisk() {
    // 结果对象 / Result object
    const result = {
      // 检查类型 / Check type
      type: 'liquidationRisk',

      // 动作 / Action
      action: RISK_ACTION.NONE,

      // 接近强平的仓位 / Positions near liquidation
      nearLiquidation: [],

      // 缓冲距离 / Buffer distance
      buffer: this.config.liquidationBuffer,
    };

    // 遍历所有强平价格 / Iterate all liquidation prices
    for (const [symbol, liqInfo] of this.liquidationPrices) {
      // 获取当前价格 / Get current price
      const priceInfo = this.priceData.get(symbol);
      if (!priceInfo) {
        continue;
      }

      const currentPrice = priceInfo.price;

      // 检查多头强平风险 / Check long liquidation risk
      if (liqInfo.side === POSITION_SIDE.LONG && liqInfo.liquidationPrice > 0) {
        // 计算距离强平价格的百分比 / Calculate distance to liquidation price
        // 距离 = (当前价格 - 强平价格) / 当前价格
        // Distance = (current price - liquidation price) / current price
        const distance = (currentPrice - liqInfo.liquidationPrice) / currentPrice;

        // 如果距离小于缓冲距离 / If distance less than buffer
        if (distance < this.config.liquidationBuffer) {
          // 添加到接近强平列表 / Add to near liquidation list
          result.nearLiquidation.push({
            symbol,
            side: POSITION_SIDE.LONG,
            currentPrice,
            liquidationPrice: liqInfo.liquidationPrice,
            distance,
          });

          // 设置动作为警报 / Set action to alert
          result.action = RISK_ACTION.ALERT;

          // 记录日志 / Log
          this.log(
            `⚠️ 多头接近强平: ${symbol} 当前价格 ${currentPrice.toFixed(2)} 强平价格 ${liqInfo.liquidationPrice.toFixed(2)} 距离 ${(distance * 100).toFixed(2)}%`,
            'error'
          );
        }
      }

      // 检查空头强平风险 / Check short liquidation risk
      if (liqInfo.side === POSITION_SIDE.SHORT && liqInfo.liquidationPrice > 0) {
        // 计算距离强平价格的百分比 / Calculate distance to liquidation price
        // 空头: 距离 = (强平价格 - 当前价格) / 当前价格
        // Short: Distance = (liquidation price - current price) / current price
        const distance = (liqInfo.liquidationPrice - currentPrice) / currentPrice;

        // 如果距离小于缓冲距离 / If distance less than buffer
        if (distance < this.config.liquidationBuffer) {
          // 添加到接近强平列表 / Add to near liquidation list
          result.nearLiquidation.push({
            symbol,
            side: POSITION_SIDE.SHORT,
            currentPrice,
            liquidationPrice: liqInfo.liquidationPrice,
            distance,
          });

          // 设置动作为警报 / Set action to alert
          result.action = RISK_ACTION.ALERT;

          // 记录日志 / Log
          this.log(
            `⚠️ 空头接近强平: ${symbol} 当前价格 ${currentPrice.toFixed(2)} 强平价格 ${liqInfo.liquidationPrice.toFixed(2)} 距离 ${(distance * 100).toFixed(2)}%`,
            'error'
          );
        }
      }
    }

    // 返回结果 / Return result
    return result;
  }

  // ============================================
  // 风控动作 / Risk Actions
  // ============================================

  /**
   * 触发紧急全平
   * Trigger emergency close all
   *
   * @param {string} reason - 原因 / Reason
   * @param {Object} details - 详情 / Details
   * @private
   */
  async _triggerEmergencyClose(reason, details) {
    // 记录触发 / Record trigger
    this._recordTrigger('emergencyClose', reason, details);

    // 记录日志 / Log
    this.log(`🚨 触发紧急全平: ${reason}`, 'error');

    // 暂停交易 / Pause trading
    this.state.tradingAllowed = false;
    this.state.pauseReason = reason;

    // 发出紧急全平事件 / Emit emergency close event
    this.emit('emergencyClose', { reason, details });

    // 调用执行器紧急全平 / Call executor emergency close
    if (this.executor && typeof this.executor.emergencyCloseAll === 'function') {
      try {
        // 调用紧急全平 / Call emergency close
        await this.executor.emergencyCloseAll();

        // 记录日志 / Log
        this.log('✓ 紧急全平执行完成 / Emergency close executed', 'info');

      } catch (error) {
        // 记录错误 / Log error
        this.log(`✗ 紧急全平执行失败: ${error.message}`, 'error');

        // 发出错误事件 / Emit error event
        this.emit('error', { type: 'emergencyClose', error });
      }
    } else {
      // 执行器不可用 / Executor not available
      this.log('⚠️ 执行器不可用，无法执行紧急全平', 'error');

      // 发出警报 / Emit alert
      this.emit('alert', {
        type: 'executorUnavailable',
        message: '执行器不可用，需要手动平仓 / Executor unavailable, manual close required',
      });
    }
  }

  /**
   * 暂停交易
   * Pause trading
   *
   * @param {string} reason - 原因 / Reason
   * @param {Object} details - 详情 / Details
   * @private
   */
  _pauseTrading(reason, details) {
    // 如果已经暂停，跳过 / If already paused, skip
    if (!this.state.tradingAllowed) {
      return;
    }

    // 记录触发 / Record trigger
    this._recordTrigger('pauseTrading', reason, details);

    // 暂停交易 / Pause trading
    this.state.tradingAllowed = false;
    this.state.pauseReason = reason;

    // 记录日志 / Log
    this.log(`⏸️ 交易已暂停: ${reason}`, 'warn');

    // 发出暂停事件 / Emit pause event
    this.emit('tradingPaused', { reason, details });
  }

  /**
   * 减仓山寨币
   * Reduce altcoin positions
   *
   * @param {Object} details - 详情 / Details
   * @private
   */
  async _reduceAltcoinPositions(details) {
    // 记录触发 / Record trigger
    this._recordTrigger('reduceAltcoins', 'BTC 急跌 / BTC crash', details);

    // 记录日志 / Log
    this.log(`📉 开始减仓山寨币: 减仓比例 ${(this.config.altcoinReduceRatio * 100).toFixed(0)}%`, 'warn');

    // 发出减仓事件 / Emit reduce event
    this.emit('reduceAltcoins', { details, ratio: this.config.altcoinReduceRatio });

    // 收集需要减仓的仓位 / Collect positions to reduce
    const positionsToReduce = [];

    // 遍历所有持仓 / Iterate all positions
    for (const [exchangeName, positions] of this.positionData) {
      for (const [symbol, position] of Object.entries(positions)) {
        // 检查是否是山寨币 / Check if altcoin
        const baseSymbol = symbol.split('/')[0];

        // 跳过 BTC / Skip BTC
        if (baseSymbol === 'BTC') {
          continue;
        }

        // 如果配置了山寨币列表，只处理列表中的 / If altcoin list configured, only process those in list
        if (this.config.altcoinSymbols.length > 0 &&
            !this.config.altcoinSymbols.includes(baseSymbol)) {
          continue;
        }

        // 计算减仓数量 / Calculate reduction amount
        const reduceAmount = Math.abs(position.contracts || position.size || 0) * this.config.altcoinReduceRatio;

        // 如果有仓位需要减 / If position needs reduction
        if (reduceAmount > 0) {
          positionsToReduce.push({
            exchange: exchangeName,
            symbol,
            side: position.side,
            currentSize: Math.abs(position.contracts || position.size || 0),
            reduceAmount,
          });
        }
      }
    }

    // 调用执行器减仓 / Call executor to reduce
    if (this.executor && positionsToReduce.length > 0) {
      for (const pos of positionsToReduce) {
        try {
          // 记录日志 / Log
          this.log(`减仓: ${pos.symbol} 减少 ${pos.reduceAmount.toFixed(4)}`, 'info');

          // 确定平仓方向 / Determine close direction
          const closeSide = pos.side === POSITION_SIDE.LONG ? 'sell' : 'buy';

          // 调用执行器 / Call executor
          await this.executor.executeMarketOrder({
            symbol: pos.symbol,
            side: closeSide,
            amount: pos.reduceAmount,
            reduceOnly: true,
          });

        } catch (error) {
          // 记录错误 / Log error
          this.log(`减仓失败 ${pos.symbol}: ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * 净值回撤触发减仓
   * Reduce positions for equity drawdown
   *
   * @param {Object} details - 详情 / Details
   * @private
   */
  async _reducePositionsForEquityDrawdown(details) {
    // 记录触发 / Record trigger
    this._recordTrigger('reduceForEquityDrawdown', '净值回撤危险 / Equity drawdown danger', details);

    // 记录日志 / Log
    const reduceRatio = this.config.equityDrawdownReduceRatio;
    this.log(
      `📉 净值回撤触发减仓: 回撤 ${(details.drawdown * 100).toFixed(2)}%, 减仓比例 ${(reduceRatio * 100).toFixed(0)}%`,
      'warn'
    );

    // 发出减仓事件 / Emit reduce event
    this.emit('reduceForEquityDrawdown', {
      details,
      ratio: reduceRatio,
      drawdown: details.drawdown,
      drawdownAmount: details.drawdownAmount,
    });

    // 收集需要减仓的仓位 / Collect positions to reduce
    const positionsToReduce = [];

    // 遍历所有持仓 / Iterate all positions
    for (const [exchangeName, positions] of this.positionData) {
      for (const [symbol, position] of Object.entries(positions)) {
        // 计算减仓数量 / Calculate reduction amount
        const currentSize = Math.abs(position.contracts || position.size || 0);
        const reduceAmount = currentSize * reduceRatio;

        // 如果有仓位需要减 / If position needs reduction
        if (reduceAmount > 0) {
          positionsToReduce.push({
            exchange: exchangeName,
            symbol,
            side: position.side,
            currentSize,
            reduceAmount,
          });
        }
      }
    }

    // 调用执行器减仓 / Call executor to reduce
    if (this.executor && positionsToReduce.length > 0) {
      this.log(`需要减仓 ${positionsToReduce.length} 个仓位 / Need to reduce ${positionsToReduce.length} positions`, 'info');

      for (const pos of positionsToReduce) {
        try {
          // 记录日志 / Log
          this.log(`减仓: ${pos.symbol} 减少 ${pos.reduceAmount.toFixed(4)} (${(reduceRatio * 100).toFixed(0)}%)`, 'info');

          // 确定平仓方向 / Determine close direction
          const closeSide = pos.side === POSITION_SIDE.LONG || pos.side === 'long' ? 'sell' : 'buy';

          // 调用执行器 / Call executor
          await this.executor.executeMarketOrder({
            symbol: pos.symbol,
            side: closeSide,
            amount: pos.reduceAmount,
            reduceOnly: true,
          });

        } catch (error) {
          // 记录错误 / Log error
          this.log(`减仓失败 ${pos.symbol}: ${error.message}`, 'error');
        }
      }

      this.log('✓ 净值回撤减仓完成 / Equity drawdown reduction completed', 'info');
    } else if (positionsToReduce.length === 0) {
      this.log('无持仓需要减仓 / No positions to reduce', 'info');
    } else {
      // 执行器不可用 / Executor not available
      this.log('⚠️ 执行器不可用，需要手动减仓', 'error');

      // 发出警报 / Emit alert
      this.emit('alert', {
        type: 'executorUnavailable',
        message: '执行器不可用，需要手动减仓 / Executor unavailable, manual reduction required',
        positionsToReduce,
      });
    }
  }

  /**
   * 发出警报
   * Emit alert
   *
   * @param {string} message - 警报消息 / Alert message
   * @param {Object} details - 详情 / Details
   * @private
   */
  _emitAlert(message, details) {
    // 记录日志 / Log
    this.log(`⚠️ 风控警报: ${message}`, 'warn');

    // 发出警报事件 / Emit alert event
    this.emit('alert', { message, details, timestamp: Date.now() });
  }

  // ============================================
  // 强平价格计算 / Liquidation Price Calculation
  // ============================================

  /**
   * 更新所有仓位的强平价格
   * Update liquidation prices for all positions
   * @private
   */
  _updateLiquidationPrices() {
    // 清空旧数据 / Clear old data
    this.liquidationPrices.clear();

    // 遍历所有持仓 / Iterate all positions
    for (const [exchangeName, positions] of this.positionData) {
      for (const [symbol, position] of Object.entries(positions)) {
        // 如果没有仓位，跳过 / If no position, skip
        if (!position.contracts && !position.size) {
          continue;
        }

        // 获取账户信息 / Get account info
        const accountInfo = this.accountData.get(exchangeName);
        if (!accountInfo) {
          continue;
        }

        // 计算强平价格 / Calculate liquidation price
        const liqPrice = this._calculateLiquidationPrice(position, accountInfo);

        // 保存强平价格 / Save liquidation price
        this.liquidationPrices.set(symbol, liqPrice);
      }
    }
  }

  /**
   * 计算单个仓位的强平价格
   * Calculate liquidation price for a single position
   *
   * @param {Object} position - 持仓信息 / Position info
   * @param {Object} accountInfo - 账户信息 / Account info
   * @returns {Object} 强平价格信息 / Liquidation price info
   * @private
   */
  _calculateLiquidationPrice(position, accountInfo) {
    // 获取仓位参数 / Get position parameters
    const entryPrice = position.entryPrice || position.avgPrice || 0;  // 开仓均价 / Entry price
    const size = Math.abs(position.contracts || position.size || 0);   // 仓位数量 / Position size
    const leverage = position.leverage || 1;                            // 杠杆倍数 / Leverage
    const side = position.side;                                         // 持仓方向 / Position side

    // 获取维持保证金率 / Get maintenance margin rate
    const mmr = this.config.maintenanceMarginRate;

    // 计算名义价值 / Calculate notional value
    const notional = size * entryPrice;

    // 计算初始保证金 / Calculate initial margin
    const initialMargin = notional / leverage;

    // 计算强平价格 / Calculate liquidation price
    // 多头强平价格 = 开仓价 × (1 - 1/杠杆 + 维持保证金率)
    // 空头强平价格 = 开仓价 × (1 + 1/杠杆 - 维持保证金率)
    // Long liq price = entry × (1 - 1/leverage + MMR)
    // Short liq price = entry × (1 + 1/leverage - MMR)
    let liquidationPrice = 0;

    if (side === POSITION_SIDE.LONG || side === 'long') {
      // 多头强平价格 / Long liquidation price
      liquidationPrice = entryPrice * (1 - 1 / leverage + mmr);

    } else if (side === POSITION_SIDE.SHORT || side === 'short') {
      // 空头强平价格 / Short liquidation price
      liquidationPrice = entryPrice * (1 + 1 / leverage - mmr);
    }

    // 返回强平价格信息 / Return liquidation price info
    return {
      // 持仓方向 / Position side
      side,

      // 开仓均价 / Entry price
      entryPrice,

      // 仓位数量 / Position size
      size,

      // 杠杆倍数 / Leverage
      leverage,

      // 强平价格 / Liquidation price
      liquidationPrice,

      // 初始保证金 / Initial margin
      initialMargin,

      // 名义价值 / Notional value
      notional,

      // 计算时间 / Calculation time
      timestamp: Date.now(),
    };
  }

  /**
   * 获取指定交易对的强平价格
   * Get liquidation price for a symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 强平价格信息 / Liquidation price info
   */
  getLiquidationPrice(symbol) {
    // 返回缓存的强平价格 / Return cached liquidation price
    return this.liquidationPrices.get(symbol) || null;
  }

  /**
   * 获取所有强平价格
   * Get all liquidation prices
   *
   * @returns {Map} 强平价格映射 / Liquidation price map
   */
  getAllLiquidationPrices() {
    // 返回强平价格副本 / Return copy of liquidation prices
    return new Map(this.liquidationPrices);
  }

  // ============================================
  // 数据刷新 / Data Refresh
  // ============================================

  /**
   * 刷新账户数据
   * Refresh account data
   * @private
   */
  async _refreshAccountData() {
    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        // 获取账户余额 / Fetch account balance
        const balance = await exchange.fetchBalance();

        // 提取关键数据 / Extract key data
        const accountInfo = {
          // 总权益 / Total equity
          equity: balance.total?.USDT || balance.USDT?.total || 0,

          // 可用余额 / Available balance
          available: balance.free?.USDT || balance.USDT?.free || 0,

          // 已用保证金 / Used margin
          usedMargin: balance.used?.USDT || balance.USDT?.used || 0,

          // 更新时间 / Update time
          timestamp: Date.now(),
        };

        // 保存账户数据 / Save account data
        this.accountData.set(exchangeName, accountInfo);

      } catch (error) {
        // 记录错误 / Log error
        this.log(`刷新 ${exchangeName} 账户数据失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 刷新持仓数据
   * Refresh position data
   * @private
   */
  async _refreshPositionData() {
    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        // 获取持仓 / Fetch positions
        const positions = await exchange.fetchPositions();

        // 转换为映射格式 / Convert to map format
        const positionMap = {};
        for (const pos of positions) {
          // 只保存有仓位的 / Only save positions with size
          if (pos.contracts > 0 || pos.size > 0) {
            positionMap[pos.symbol] = pos;
          }
        }

        // 保存持仓数据 / Save position data
        this.positionData.set(exchangeName, positionMap);

      } catch (error) {
        // 记录错误 / Log error
        this.log(`刷新 ${exchangeName} 持仓数据失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 刷新价格数据
   * Refresh price data
   * @private
   */
  async _refreshPrices() {
    // 收集所有需要的交易对 / Collect all needed symbols
    const symbols = new Set();

    // 从持仓中收集 / Collect from positions
    for (const [, positions] of this.positionData) {
      for (const symbol of Object.keys(positions)) {
        symbols.add(symbol);
      }
    }

    // 添加 BTC (用于急跌检测) / Add BTC (for crash detection)
    symbols.add('BTC/USDT');

    // 获取第一个交易所实例 / Get first exchange instance
    const [, exchange] = this.exchanges.entries().next().value || [];

    // 如果没有交易所，跳过 / If no exchange, skip
    if (!exchange) {
      return;
    }

    // 批量获取行情 / Fetch tickers in batch
    try {
      // 获取所有行情 / Fetch all tickers
      const tickers = await exchange.fetchTickers(Array.from(symbols));

      // 更新价格缓存 / Update price cache
      for (const [symbol, ticker] of Object.entries(tickers)) {
        this.priceData.set(symbol, {
          price: ticker.last || ticker.close,
          bid: ticker.bid,
          ask: ticker.ask,
          timestamp: Date.now(),
        });
      }

    } catch (error) {
      // 记录错误 / Log error
      if (this.config.verbose) {
        this.log(`刷新价格数据失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 更新价格 (外部调用)
   * Update price (external call)
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} price - 价格 / Price
   */
  updatePrice(symbol, price) {
    // 更新价格缓存 / Update price cache
    this.priceData.set(symbol, {
      price,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 初始化每日权益
   * Initialize daily equity
   * @private
   */
  _initDailyEquity() {
    // 计算当前总权益 / Calculate current total equity
    let totalEquity = 0;
    for (const [, accountInfo] of this.accountData) {
      totalEquity += accountInfo.equity || 0;
    }

    // 设置今日起始权益 / Set today's start equity
    this.dailyEquity.startEquity = totalEquity;
    this.dailyEquity.peakEquity = totalEquity;
    this.dailyEquity.dayStart = this._getDayStart();
    this.dailyEquity.currentDrawdown = 0;

    // 初始化/更新净值回撤数据 / Initialize/update equity drawdown data
    // 如果历史最高为0，说明是首次初始化 / If all-time high is 0, it's first initialization
    if (this.equityDrawdown.allTimeHighEquity === 0) {
      this.equityDrawdown.allTimeHighEquity = totalEquity;
      this.equityDrawdown.allTimeHighTime = Date.now();
    }
    // 如果当前权益超过历史最高，更新 / Update if current equity exceeds all-time high
    else if (totalEquity > this.equityDrawdown.allTimeHighEquity) {
      this.equityDrawdown.allTimeHighEquity = totalEquity;
      this.equityDrawdown.allTimeHighTime = Date.now();
    }

    this.equityDrawdown.lastUpdateTime = Date.now();
  }

  /**
   * 检查是否跨天
   * Check if crossed day
   * @private
   */
  _checkDayReset() {
    // 获取当天开始时间 / Get day start time
    const currentDayStart = this._getDayStart();

    // 如果跨天 / If crossed day
    if (currentDayStart > this.dailyEquity.dayStart) {
      // 重置每日权益 / Reset daily equity
      this._initDailyEquity();

      // 重置交易暂停状态 / Reset trading pause status
      if (this.state.pauseReason === '每日回撤超限 / Daily drawdown exceeded') {
        this.state.tradingAllowed = true;
        this.state.pauseReason = null;

        // 记录日志 / Log
        this.log('跨天重置: 交易已恢复 / Day reset: Trading resumed', 'info');

        // 发出恢复事件 / Emit resume event
        this.emit('tradingResumed', { reason: '跨天重置 / Day reset' });
      }

      // 记录日志 / Log
      this.log(`跨天重置: 新起始权益 ${this.dailyEquity.startEquity.toFixed(2)} USDT`, 'info');
    }
  }

  /**
   * 获取当天开始时间戳
   * Get day start timestamp
   *
   * @returns {number} 当天开始时间戳 / Day start timestamp
   * @private
   */
  _getDayStart() {
    // 获取当前时间 / Get current time
    const now = new Date();

    // 返回当天 0 点时间戳 / Return day start timestamp
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  /**
   * 更新风险级别
   * Update risk level
   * @private
   */
  _updateRiskLevel() {
    // 默认正常 / Default normal
    let level = RISK_LEVEL.NORMAL;

    // 根据各项指标更新级别 / Update level based on indicators
    // 优先级: EMERGENCY > CRITICAL > DANGER > WARNING > NORMAL

    // 检查交易状态 / Check trading status
    if (!this.state.tradingAllowed) {
      level = RISK_LEVEL.DANGER;
    }

    // 检查回撤 / Check drawdown
    if (this.dailyEquity.currentDrawdown > this.config.drawdownWarningThreshold) {
      level = level === RISK_LEVEL.NORMAL ? RISK_LEVEL.WARNING : level;
    }

    if (this.dailyEquity.currentDrawdown > this.config.maxDailyDrawdown) {
      level = RISK_LEVEL.DANGER;
    }

    // 保存风险级别 / Save risk level
    this.state.riskLevel = level;
  }

  /**
   * 记录风控触发
   * Record risk trigger
   *
   * @param {string} type - 触发类型 / Trigger type
   * @param {string} reason - 原因 / Reason
   * @param {Object} details - 详情 / Details
   * @private
   */
  _recordTrigger(type, reason, details) {
    // 创建触发记录 / Create trigger record
    const trigger = {
      type,
      reason,
      details,
      timestamp: Date.now(),
    };

    // 添加到历史 / Add to history
    this.state.triggers.push(trigger);

    // 限制历史长度 / Limit history length
    if (this.state.triggers.length > 100) {
      this.state.triggers = this.state.triggers.slice(-100);
    }

    // 发出触发事件 / Emit trigger event
    this.emit('riskTriggered', trigger);
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
        console.log(fullMessage);
        break;
    }
  }

  // ============================================
  // 公共 API / Public API
  // ============================================

  /**
   * 手动恢复交易
   * Manual resume trading
   */
  resumeTrading() {
    // 恢复交易 / Resume trading
    this.state.tradingAllowed = true;
    this.state.pauseReason = null;

    // 记录日志 / Log
    this.log('交易已手动恢复 / Trading manually resumed', 'info');

    // 发出恢复事件 / Emit resume event
    this.emit('tradingResumed', { reason: '手动恢复 / Manual resume' });
  }

  /**
   * 手动暂停交易
   * Manual pause trading
   *
   * @param {string} reason - 原因 / Reason
   */
  manualPauseTrading(reason = '手动暂停 / Manual pause') {
    // 暂停交易 / Pause trading
    this._pauseTrading(reason, { manual: true });
  }

  /**
   * 获取风控状态
   * Get risk status
   *
   * @returns {Object} 风控状态 / Risk status
   */
  getStatus() {
    // 返回状态对象 / Return status object
    return {
      // 运行状态 / Running status
      running: this.state.running,

      // 风险级别 / Risk level
      riskLevel: this.state.riskLevel,

      // 交易状态 / Trading status
      tradingAllowed: this.state.tradingAllowed,
      pauseReason: this.state.pauseReason,

      // 保证金信息 / Margin info
      accounts: Array.from(this.accountData.entries()).map(([name, data]) => ({
        exchange: name,
        ...data,
      })),

      // 每日权益 / Daily equity
      dailyEquity: { ...this.dailyEquity },

      // 净值回撤 / Equity drawdown
      equityDrawdown: { ...this.equityDrawdown },

      // 强平价格 / Liquidation prices
      liquidationPrices: Array.from(this.liquidationPrices.entries()).map(([symbol, data]) => ({
        symbol,
        ...data,
      })),

      // 最近触发 / Recent triggers
      recentTriggers: this.state.triggers.slice(-10),

      // 最后检查时间 / Last check time
      lastCheckTime: this.state.lastCheckTime,

      // 配置 / Configuration
      config: {
        emergencyMarginRate: this.config.emergencyMarginRate,
        maxSinglePositionRatio: this.config.maxSinglePositionRatio,
        maxDailyDrawdown: this.config.maxDailyDrawdown,
        btcCrashThreshold: this.config.btcCrashThreshold,
        // 净值回撤配置 / Equity drawdown config
        maxEquityDrawdown: this.config.maxEquityDrawdown,
        equityDrawdownDangerThreshold: this.config.equityDrawdownDangerThreshold,
        equityDrawdownWarningThreshold: this.config.equityDrawdownWarningThreshold,
        enableEquityDrawdownMonitor: this.config.enableEquityDrawdownMonitor,
      },
    };
  }

  /**
   * 检查订单风险
   * Check order risk
   *
   * @param {Object} order - 订单信息 / Order info
   * @param {string} order.symbol - 交易对 / Symbol
   * @param {string} order.side - 方向 (buy/sell) / Side
   * @param {number} order.amount - 数量 / Amount
   * @param {number} order.price - 价格 / Price
   * @returns {Object} 检查结果 / Check result
   */
  checkOrder(order) {
    // 结果对象 / Result object
    const result = {
      allowed: true,
      reasons: [],
      warnings: [],
    };

    // 1. 检查交易是否被暂停 / Check if trading is paused
    if (!this.state.tradingAllowed) {
      result.allowed = false;
      result.reasons.push(`交易已暂停: ${this.state.pauseReason || '未知原因'} / Trading paused`);
      return result;
    }

    // 2. 检查风险级别 / Check risk level
    if (this.state.riskLevel === RISK_LEVEL.EMERGENCY) {
      result.allowed = false;
      result.reasons.push('风险级别为紧急，禁止交易 / Emergency risk level, trading forbidden');
      return result;
    }

    if (this.state.riskLevel === RISK_LEVEL.CRITICAL) {
      result.allowed = false;
      result.reasons.push('风险级别为严重，禁止交易 / Critical risk level, trading forbidden');
      return result;
    }

    // 3. 检查净值回撤 / Check equity drawdown
    if (this.config.enableEquityDrawdownMonitor) {
      const drawdown = this.equityDrawdown.currentDrawdown;

      // 紧急回撤，禁止交易 / Emergency drawdown, forbid trading
      if (drawdown >= this.config.maxEquityDrawdown) {
        result.allowed = false;
        result.reasons.push(`净值回撤超限: ${(drawdown * 100).toFixed(2)}% / Equity drawdown exceeded`);
        return result;
      }

      // 警告级别回撤，只警告不拒绝 / Warning level drawdown, warn but don't reject
      if (drawdown >= this.config.equityDrawdownWarningThreshold) {
        result.warnings.push(`净值回撤警告: ${(drawdown * 100).toFixed(2)}% / Equity drawdown warning`);
      }
    }

    // 4. 检查每日回撤 / Check daily drawdown
    if (this.dailyEquity.currentDrawdown >= this.config.maxDailyDrawdown) {
      result.allowed = false;
      result.reasons.push(`当日回撤超限: ${(this.dailyEquity.currentDrawdown * 100).toFixed(2)}% / Daily drawdown exceeded`);
      return result;
    }

    // 5. 危险级别风险，添加警告 / Danger level risk, add warning
    if (this.state.riskLevel === RISK_LEVEL.DANGER) {
      result.warnings.push('风险级别为危险，建议谨慎交易 / Danger risk level, trade with caution');
    }

    // 6. 警告级别风险，添加警告 / Warning level risk, add warning
    if (this.state.riskLevel === RISK_LEVEL.WARNING) {
      result.warnings.push('风险级别为警告 / Warning risk level');
    }

    return result;
  }

  /**
   * 检查是否允许交易
   * Check if trading is allowed
   *
   * @returns {boolean} 是否允许交易 / Whether trading is allowed
   */
  isTradingAllowed() {
    return this.state.tradingAllowed;
  }

  /**
   * 获取当前风险级别
   * Get current risk level
   *
   * @returns {string} 风险级别 / Risk level
   */
  getRiskLevel() {
    return this.state.riskLevel;
  }

  /**
   * 获取净值回撤状态
   * Get equity drawdown status
   *
   * @returns {Object} 净值回撤状态 / Equity drawdown status
   */
  getEquityDrawdownStatus() {
    return {
      // 是否启用 / Whether enabled
      enabled: this.config.enableEquityDrawdownMonitor,

      // 历史最高净值 / All-time high equity
      allTimeHighEquity: this.equityDrawdown.allTimeHighEquity,

      // 历史最高净值时间 / All-time high timestamp
      allTimeHighTime: this.equityDrawdown.allTimeHighTime,

      // 当前净值回撤 (百分比) / Current drawdown (percentage)
      currentDrawdown: this.equityDrawdown.currentDrawdown,

      // 当前净值回撤金额 / Current drawdown amount
      currentDrawdownAmount: this.equityDrawdown.currentDrawdownAmount,

      // 最大历史回撤 / Maximum historical drawdown
      maxDrawdown: this.equityDrawdown.maxDrawdown,

      // 最大回撤时间 / Maximum drawdown time
      maxDrawdownTime: this.equityDrawdown.maxDrawdownTime,

      // 触发次数统计 / Trigger counts
      triggerCounts: { ...this.equityDrawdown.triggerCounts },

      // 阈值配置 / Threshold configuration
      thresholds: {
        alert: this.config.equityDrawdownAlertThreshold,
        warning: this.config.equityDrawdownWarningThreshold,
        danger: this.config.equityDrawdownDangerThreshold,
        emergency: this.config.maxEquityDrawdown,
      },

      // 当前风险级别 / Current risk level
      riskLevel: this._getEquityDrawdownRiskLevel(),

      // 最后更新时间 / Last update time
      lastUpdateTime: this.equityDrawdown.lastUpdateTime,
    };
  }

  /**
   * 获取净值回撤风险级别
   * Get equity drawdown risk level
   *
   * @returns {string} 风险级别 / Risk level
   * @private
   */
  _getEquityDrawdownRiskLevel() {
    const drawdown = this.equityDrawdown.currentDrawdown;

    if (drawdown >= this.config.maxEquityDrawdown) {
      return RISK_LEVEL.EMERGENCY;
    } else if (drawdown >= this.config.equityDrawdownDangerThreshold) {
      return RISK_LEVEL.DANGER;
    } else if (drawdown >= this.config.equityDrawdownWarningThreshold) {
      return RISK_LEVEL.WARNING;
    } else if (drawdown >= this.config.equityDrawdownAlertThreshold) {
      return RISK_LEVEL.WARNING;
    }

    return RISK_LEVEL.NORMAL;
  }

  /**
   * 设置历史最高净值 (用于恢复状态)
   * Set all-time high equity (for state restoration)
   *
   * @param {number} equity - 历史最高净值 / All-time high equity
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  setAllTimeHighEquity(equity, timestamp = Date.now()) {
    if (equity > 0) {
      this.equityDrawdown.allTimeHighEquity = equity;
      this.equityDrawdown.allTimeHighTime = timestamp;
      this.log(`设置历史最高净值: ${equity.toFixed(2)} USDT`, 'info');
    }
  }

  /**
   * 重置净值回撤统计
   * Reset equity drawdown statistics
   *
   * @param {boolean} resetAllTimeHigh - 是否重置历史最高 / Whether to reset all-time high
   */
  resetEquityDrawdownStats(resetAllTimeHigh = false) {
    // 重置触发计数 / Reset trigger counts
    this.equityDrawdown.triggerCounts = {
      alert: 0,
      warning: 0,
      danger: 0,
      emergency: 0,
    };

    // 重置最大回撤 / Reset max drawdown
    this.equityDrawdown.maxDrawdown = 0;
    this.equityDrawdown.maxDrawdownTime = 0;

    // 如果需要，重置历史最高 / Reset all-time high if needed
    if (resetAllTimeHigh) {
      // 计算当前总权益 / Calculate current total equity
      let currentEquity = 0;
      for (const [, accountInfo] of this.accountData) {
        currentEquity += accountInfo.equity || 0;
      }

      this.equityDrawdown.allTimeHighEquity = currentEquity;
      this.equityDrawdown.allTimeHighTime = Date.now();
      this.equityDrawdown.currentDrawdown = 0;
      this.equityDrawdown.currentDrawdownAmount = 0;
    }

    this.log('净值回撤统计已重置 / Equity drawdown stats reset', 'info');
    this.emit('equityDrawdownReset', { resetAllTimeHigh });
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  RISK_LEVEL,
  RISK_ACTION,
  POSITION_SIDE,
  DEFAULT_CONFIG,
};

// 默认导出 / Default export
export default AdvancedRiskManager;
