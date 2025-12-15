/**
 * 监控服务主入口
 * Monitor Service Main Entry
 *
 * 独立运行的监控服务
 * Standalone monitoring service
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入系统监控器 / Import system monitor
import { SystemMonitor } from './SystemMonitor.js';

// 导入告警管理器 / Import alert manager
import { AlertManager } from './AlertManager.js';

/**
 * 监控服务类
 * Monitor Service Class
 */
class MonitorService {
  /**
   * 构造函数
   */
  constructor() {
    // 创建系统监控器 / Create system monitor
    this.monitor = new SystemMonitor({
      collectInterval: 10000,
      healthCheckInterval: 30000,
    });

    // 创建告警管理器 / Create alert manager
    this.alertManager = new AlertManager({
      enableEmail: !!process.env.SMTP_HOST,
      enableTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
      enableDingTalk: !!process.env.DINGTALK_WEBHOOK,
    });

    // 绑定事件 / Bind events
    this._bindEvents();
  }

  /**
   * 启动服务
   * Start service
   */
  start() {
    console.log('[MonitorService] 启动监控服务 / Starting monitor service');

    // 启动系统监控 / Start system monitor
    this.monitor.start();

    // 注册健康检查 / Register health checks
    this._registerHealthChecks();

    // 发送 PM2 ready 信号 / Send PM2 ready signal
    if (process.send) {
      process.send('ready');
    }

    console.log('[MonitorService] 监控服务已启动 / Monitor service started');
  }

  /**
   * 停止服务
   * Stop service
   */
  stop() {
    console.log('[MonitorService] 停止监控服务 / Stopping monitor service');

    // 停止系统监控 / Stop system monitor
    this.monitor.stop();

    console.log('[MonitorService] 监控服务已停止 / Monitor service stopped');
  }

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() {
    // 警告事件 -> 发送告警 / Warning event -> send alert
    this.monitor.on('warning', async (warning) => {
      console.warn('[MonitorService] 收到警告 / Warning received:', warning);

      // 发送警告告警 / Send warning alert
      await this.alertManager.warning(
        `系统警告: ${warning.type}`,
        warning.message,
        { value: warning.value }
      );
    });

    // 健康检查失败 -> 发送告警 / Health check failed -> send alert
    this.monitor.on('healthChecked', async (health) => {
      if (health.status === 'unhealthy') {
        // 获取失败的检查 / Get failed checks
        const failedChecks = Object.entries(health.checks)
          .filter(([, check]) => check.status === 'unhealthy')
          .map(([name, check]) => ({ name, error: check.error }));

        // 发送错误告警 / Send error alert
        await this.alertManager.error(
          '系统健康检查失败 / System Health Check Failed',
          `${failedChecks.length} 个检查失败 / ${failedChecks.length} checks failed`,
          { failedChecks }
        );
      }
    });

    // 错误记录 -> 发送告警 / Error recorded -> send alert
    this.monitor.on('errorRecorded', async (error) => {
      // 发送错误告警 / Send error alert
      await this.alertManager.error(
        '系统错误 / System Error',
        error.message || 'Unknown error',
        { stack: error.stack }
      );
    });
  }

  /**
   * 注册健康检查
   * Register health checks
   * @private
   */
  _registerHealthChecks() {
    // 内存检查 / Memory check
    this.monitor.registerHealthCheck('memory', async () => {
      const metrics = this.monitor.getMetrics();
      // 内存使用低于 1GB 视为健康 / Memory usage below 1GB is healthy
      return metrics.memory.heapUsed < 1024;
    });

    // 运行时间检查 / Uptime check
    this.monitor.registerHealthCheck('uptime', async () => {
      const metrics = this.monitor.getMetrics();
      // 运行时间大于 0 视为健康 / Uptime > 0 is healthy
      return metrics.uptime > 0;
    });
  }
}

// ============================================
// 主入口 / Main Entry
// ============================================

// 创建服务实例 / Create service instance
const service = new MonitorService();

// 启动服务 / Start service
service.start();

// 优雅退出处理 / Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[MonitorService] 收到 SIGTERM 信号 / Received SIGTERM');
  service.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[MonitorService] 收到 SIGINT 信号 / Received SIGINT');
  service.stop();
  process.exit(0);
});

// 导出服务类 / Export service class
export { MonitorService };
export default MonitorService;
