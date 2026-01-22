/**
 * 日志模块统一导出
 * Logger Module Unified Export
 *
 * 此模块整合所有日志相关功能 / This module integrates all logging features:
 * 1. PnLLogger - 高性能 PnL 日志记录 / High-performance PnL logging
 * 2. TelegramNotifier - Telegram 通知服务 / Telegram notification service
 * 3. AlertManager - 统一警报管理 / Unified alert management
 * 4. MetricsExporter - Grafana 指标导出 / Grafana metrics export
 */

// ============================================
// 导入各组件 / Import Components
// ============================================

// 导入 PnL 日志记录器 / Import PnL Logger
import { // 导入依赖
  PnLLogger,          // PnL 日志记录器类 / PnL Logger class
  LOG_LEVEL,          // 日志级别常量 / Log level constants
  LOG_TYPE,           // 日志类型常量 / Log type constants
  DEFAULT_CONFIG as PNLLOGGER_DEFAULT_CONFIG,  // PnL 日志器默认配置 / PnL logger default config
} from './PnLLogger.js'; // 执行语句

// 导入 Telegram 通知器 / Import Telegram Notifier
import { // 导入依赖
  TelegramNotifier,   // Telegram 通知器类 / Telegram Notifier class
  MESSAGE_TYPE,       // 消息类型常量 / Message type constants
  MESSAGE_PRIORITY,   // 消息优先级常量 / Message priority constants
  ALERT_TYPE,         // 警报类型常量 / Alert type constants
  EMOJI,              // Emoji 映射常量 / Emoji mapping constants
  DEFAULT_CONFIG as TELEGRAM_DEFAULT_CONFIG,  // Telegram 默认配置 / Telegram default config
} from './TelegramNotifier.js'; // 执行语句

// 导入警报管理器 / Import Alert Manager
import { // 导入依赖
  AlertManager,       // 警报管理器类 / Alert Manager class
  ALERT_LEVEL,        // 警报级别常量 / Alert level constants
  ALERT_CATEGORY,     // 警报类别常量 / Alert category constants
  ALERT_ACTION,       // 警报动作常量 / Alert action constants
  DEFAULT_CONFIG as ALERT_DEFAULT_CONFIG,  // 警报管理器默认配置 / Alert manager default config
} from './AlertManager.js'; // 执行语句

// 导入指标导出器 / Import Metrics Exporter
import { // 导入依赖
  MetricsExporter,    // 指标导出器类 / Metrics Exporter class
  METRIC_TYPE,        // 指标类型常量 / Metric type constants
  PREDEFINED_METRICS, // 预定义指标常量 / Predefined metrics constants
  DEFAULT_CONFIG as METRICS_DEFAULT_CONFIG,  // 指标导出器默认配置 / Metrics exporter default config
} from './MetricsExporter.js'; // 执行语句

// 导入审计日志记录器 / Import Audit Logger
import { // 导入依赖
  AuditLogger,        // 审计日志记录器类 / Audit Logger class
  AuditEventType,     // 审计事件类型常量 / Audit event type constants
  AuditLevel,         // 审计级别常量 / Audit level constants
} from './AuditLogger.js'; // 执行语句

// ============================================
// 日志模块工厂函数 / Logger Module Factory Function
// ============================================

/**
 * 创建完整的日志模块实例
 * Create complete logger module instance
 *
 * @param {Object} config - 配置对象 / Configuration object
 * @returns {Object} 日志模块实例 / Logger module instance
 *
 * @example
 * // 创建日志模块 / Create logger module
 * const loggerModule = createLoggerModule({
 *   telegram: { botToken: 'xxx', chatId: 'xxx' },
 *   pnlLogger: { logDir: './logs' },
 *   alertManager: { escalationEnabled: true },
 *   metricsExporter: { httpPort: 9090 },
 * });
 *
 * // 设置数据源 / Set data sources
 * loggerModule.setDataSources({
 *   riskManager: myRiskManager,
 *   positionManager: myPositionManager,
 *   executor: myExecutor,
 * });
 *
 * // 启动所有服务 / Start all services
 * await loggerModule.startAll();
 */
function createLoggerModule(config = {}) { // 定义函数 createLoggerModule
  // 创建 PnL 日志记录器实例 / Create PnL Logger instance
  const pnlLogger = new PnLLogger(config.pnlLogger || {}); // 定义常量 pnlLogger

  // 创建 Telegram 通知器实例 / Create Telegram Notifier instance
  const telegramNotifier = new TelegramNotifier(config.telegram || {}); // 定义常量 telegramNotifier

  // 创建警报管理器实例 / Create Alert Manager instance
  const alertManager = new AlertManager(config.alertManager || {}); // 定义常量 alertManager

  // 创建指标导出器实例 / Create Metrics Exporter instance
  const metricsExporter = new MetricsExporter(config.metricsExporter || {}); // 定义常量 metricsExporter

  // 连接警报管理器和通知器 / Connect Alert Manager to Notifiers
  alertManager.setNotifiers({ // 调用 alertManager.setNotifiers
    telegram: telegramNotifier,   // Telegram 通知器 / Telegram notifier
    pnlLogger: pnlLogger,         // PnL 日志记录器 / PnL logger
  }); // 结束代码块

  // 返回模块对象 / Return module object
  return { // 返回结果
    // ============================================
    // 组件实例 / Component Instances
    // ============================================

    // PnL 日志记录器 / PnL Logger
    pnlLogger, // 执行语句

    // Telegram 通知器 / Telegram Notifier
    telegramNotifier, // 执行语句

    // 警报管理器 / Alert Manager
    alertManager, // 执行语句

    // 指标导出器 / Metrics Exporter
    metricsExporter, // 执行语句

    // ============================================
    // 快捷方法 / Shortcut Methods
    // ============================================

    /**
     * 设置数据源到所有组件
     * Set data sources to all components
     *
     * @param {Object} sources - 数据源对象 / Data sources object
     */
    setDataSources(sources) { // 调用 setDataSources
      // 设置到 PnL 日志记录器 / Set to PnL Logger
      pnlLogger.setDataSources(sources); // 调用 pnlLogger.setDataSources

      // 设置到 Telegram 通知器 / Set to Telegram Notifier
      telegramNotifier.setDataSources(sources); // 调用 telegramNotifier.setDataSources

      // 设置到警报管理器 / Set to Alert Manager
      alertManager.setDataSources(sources); // 调用 alertManager.setDataSources

      // 设置到指标导出器 / Set to Metrics Exporter
      metricsExporter.setDataSources(sources); // 调用 metricsExporter.setDataSources
    }, // 结束代码块

    /**
     * 启动所有日志服务
     * Start all logging services
     */
    async startAll() { // 执行语句
      // 初始化 Telegram (如果配置了) / Initialize Telegram (if configured)
      await telegramNotifier.init(); // 等待异步结果

      // 启动 PnL 日志记录 / Start PnL logging
      pnlLogger.start(); // 调用 pnlLogger.start

      // 启动 Telegram 通知 / Start Telegram notifications
      telegramNotifier.start(); // 调用 telegramNotifier.start

      // 启动警报管理 / Start Alert Manager
      alertManager.start(); // 调用 alertManager.start

      // 启动指标导出 / Start Metrics Exporter
      await metricsExporter.start(); // 等待异步结果

      // 输出启动信息 / Output startup info
      console.log('[Logger] 所有日志服务已启动 / All logging services started'); // 控制台输出
    }, // 结束代码块

    /**
     * 停止所有日志服务
     * Stop all logging services
     */
    async stopAll() { // 执行语句
      // 停止警报管理 / Stop Alert Manager
      alertManager.stop(); // 调用 alertManager.stop

      // 停止 Telegram 通知 / Stop Telegram notifications
      telegramNotifier.stop(); // 调用 telegramNotifier.stop

      // 停止 PnL 日志记录 / Stop PnL logging
      pnlLogger.stop(); // 调用 pnlLogger.stop

      // 停止指标导出 / Stop Metrics Exporter
      await metricsExporter.stop(); // 等待异步结果

      // 输出停止信息 / Output shutdown info
      console.log('[Logger] 所有日志服务已停止 / All logging services stopped'); // 控制台输出
    }, // 结束代码块

    /**
     * 获取所有组件状态
     * Get all component statistics
     *
     * @returns {Object} 统计信息 / Statistics
     */
    getStats() { // 调用 getStats
      return { // 返回结果
        // PnL 日志记录器状态 / PnL Logger stats
        pnlLogger: pnlLogger.getStats(), // PnL 日志记录器状态

        // Telegram 通知器状态 / Telegram Notifier stats
        telegram: telegramNotifier.getStats(), // Telegram 通知器状态

        // 警报管理器状态 / Alert Manager stats
        alertManager: alertManager.getStats(), // 告警Manager警报管理器状态

        // 指标导出器状态 / Metrics Exporter stats
        metricsExporter: metricsExporter.getStats(), // 指标Exporter指标导出器状态
      }; // 结束代码块
    }, // 结束代码块

    /**
     * 发送手动日报
     * Send manual daily report
     */
    async sendDailyReport() { // 执行语句
      // 调用 Telegram 发送日报 / Call Telegram to send daily report
      await telegramNotifier.sendDailyReport(); // 等待异步结果
    }, // 结束代码块

    /**
     * 触发自定义警报
     * Trigger custom alert
     *
     * @param {Object} alertConfig - 警报配置 / Alert configuration
     */
    triggerAlert(alertConfig) { // 调用 triggerAlert
      // 调用警报管理器触发警报 / Call Alert Manager to trigger alert
      return alertManager.triggerAlert(alertConfig); // 返回结果
    }, // 结束代码块
  }; // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出类 / Export classes
export { // 导出命名成员
  // PnL 日志记录器 / PnL Logger
  PnLLogger, // 执行语句

  // Telegram 通知器 / Telegram Notifier
  TelegramNotifier, // 执行语句

  // 警报管理器 / Alert Manager
  AlertManager, // 执行语句

  // 指标导出器 / Metrics Exporter
  MetricsExporter, // 执行语句

  // 审计日志记录器 / Audit Logger
  AuditLogger, // 执行语句
}; // 结束代码块

// 导出 PnL 日志相关常量 / Export PnL logging constants
export { // 导出命名成员
  LOG_LEVEL,           // 日志级别 / Log levels
  LOG_TYPE,            // 日志类型 / Log types
}; // 结束代码块

// 导出 Telegram 相关常量 / Export Telegram constants
export { // 导出命名成员
  MESSAGE_TYPE,        // 消息类型 / Message types
  MESSAGE_PRIORITY,    // 消息优先级 / Message priorities
  ALERT_TYPE,          // 警报类型 / Alert types
  EMOJI,               // Emoji 映射 / Emoji mapping
}; // 结束代码块

// 导出警报管理相关常量 / Export Alert Manager constants
export { // 导出命名成员
  ALERT_LEVEL,         // 警报级别 / Alert levels
  ALERT_CATEGORY,      // 警报类别 / Alert categories
  ALERT_ACTION,        // 警报动作 / Alert actions
}; // 结束代码块

// 导出指标相关常量 / Export Metrics constants
export { // 导出命名成员
  METRIC_TYPE,         // 指标类型 / Metric types
  PREDEFINED_METRICS,  // 预定义指标 / Predefined metrics
}; // 结束代码块

// 导出审计日志相关常量 / Export Audit Logger constants
export { // 导出命名成员
  AuditEventType,      // 审计事件类型 / Audit event types
  AuditLevel,          // 审计级别 / Audit levels
}; // 结束代码块

// 导出默认配置 / Export default configurations
export { // 导出命名成员
  PNLLOGGER_DEFAULT_CONFIG,    // PnL 日志器默认配置 / PnL logger default config
  TELEGRAM_DEFAULT_CONFIG,     // Telegram 默认配置 / Telegram default config
  ALERT_DEFAULT_CONFIG,        // 警报管理器默认配置 / Alert manager default config
  METRICS_DEFAULT_CONFIG,      // 指标导出器默认配置 / Metrics exporter default config
}; // 结束代码块

// 导出工厂函数 / Export factory function
export { createLoggerModule }; // 导出命名成员

// 默认导出工厂函数 / Default export factory function
export default createLoggerModule; // 默认导出
