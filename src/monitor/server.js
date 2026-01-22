/**
 * 监控服务主入口
 * Monitor Service Main Entry
 *
 * 独立运行的监控服务
 * Standalone monitoring service
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config'; // 加载模块 dotenv/config

// 导入系统监控器 / Import system monitor
import { SystemMonitor } from './SystemMonitor.js'; // 导入模块 ./SystemMonitor.js

// 导入告警管理器 / Import alert manager
import { AlertManager } from './AlertManager.js'; // 导入模块 ./AlertManager.js

/**
 * 监控服务类
 * Monitor Service Class
 */
class MonitorService { // 定义类 MonitorService
  /**
   * 构造函数
   */
  constructor() { // 构造函数
    // 创建系统监控器 / Create system monitor
    this.monitor = new SystemMonitor({ // 设置 monitor
      collectInterval: 10000, // collect间隔
      healthCheckInterval: 30000, // healthCheck间隔
    }); // 结束代码块

    // 创建告警管理器 / Create alert manager
    this.alertManager = new AlertManager({ // 设置 alertManager
      enableEmail: !!process.env.SMTP_HOST, // 启用邮箱
      enableTelegram: !!process.env.TELEGRAM_BOT_TOKEN, // 启用Telegram
      enableDingTalk: !!process.env.DINGTALK_WEBHOOK, // 启用DingTalk
    }); // 结束代码块

    // 绑定事件 / Bind events
    this._bindEvents(); // 调用 _bindEvents
  } // 结束代码块

  /**
   * 启动服务
   * Start service
   */
  start() { // 调用 start
    console.log('[MonitorService] 启动监控服务 / Starting monitor service'); // 控制台输出

    // 启动系统监控 / Start system monitor
    this.monitor.start(); // 访问 monitor

    // 注册健康检查 / Register health checks
    this._registerHealthChecks(); // 调用 _registerHealthChecks

    // 发送 PM2 ready 信号 / Send PM2 ready signal
    if (process.send) { // 条件判断 process.send
      process.send('ready'); // 调用 process.send
    } // 结束代码块

    console.log('[MonitorService] 监控服务已启动 / Monitor service started'); // 控制台输出
  } // 结束代码块

  /**
   * 停止服务
   * Stop service
   */
  stop() { // 调用 stop
    console.log('[MonitorService] 停止监控服务 / Stopping monitor service'); // 控制台输出

    // 停止系统监控 / Stop system monitor
    this.monitor.stop(); // 访问 monitor

    console.log('[MonitorService] 监控服务已停止 / Monitor service stopped'); // 控制台输出
  } // 结束代码块

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() { // 调用 _bindEvents
    // 警告事件 -> 发送告警 / Warning event -> send alert
    this.monitor.on('warning', async (warning) => { // 访问 monitor
      console.warn('[MonitorService] 收到警告 / Warning received:', warning); // 控制台输出

      // 发送警告告警 / Send warning alert
      await this.alertManager.warning( // 等待异步结果
        `系统警告: ${warning.type}`, // 执行语句
        warning.message, // 执行语句
        { value: warning.value } // 执行语句
      ); // 结束调用或参数
    }); // 结束代码块

    // 健康检查失败 -> 发送告警 / Health check failed -> send alert
    this.monitor.on('healthChecked', async (health) => { // 访问 monitor
      if (health.status === 'unhealthy') { // 条件判断 health.status === 'unhealthy'
        // 获取失败的检查 / Get failed checks
        const failedChecks = Object.entries(health.checks) // 定义常量 failedChecks
          .filter(([, check]) => check.status === 'unhealthy') // 定义箭头函数
          .map(([name, check]) => ({ name, error: check.error })); // 定义箭头函数

        // 发送错误告警 / Send error alert
        await this.alertManager.error( // 等待异步结果
          '系统健康检查失败 / System Health Check Failed', // 执行语句
          `${failedChecks.length} 个检查失败 / ${failedChecks.length} checks failed`, // 执行语句
          { failedChecks } // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    }); // 结束代码块

    // 错误记录 -> 发送告警 / Error recorded -> send alert
    this.monitor.on('errorRecorded', async (error) => { // 访问 monitor
      // 发送错误告警 / Send error alert
      await this.alertManager.error( // 等待异步结果
        '系统错误 / System Error', // 执行语句
        error.message || 'Unknown error', // 执行语句
        { stack: error.stack } // 执行语句
      ); // 结束调用或参数
    }); // 结束代码块
  } // 结束代码块

  /**
   * 注册健康检查
   * Register health checks
   * @private
   */
  _registerHealthChecks() { // 调用 _registerHealthChecks
    // 内存检查 / Memory check
    this.monitor.registerHealthCheck('memory', async () => { // 访问 monitor
      const metrics = this.monitor.getMetrics(); // 定义常量 metrics
      // 内存使用低于 1GB 视为健康 / Memory usage below 1GB is healthy
      return metrics.memory.heapUsed < 1024; // 返回结果
    }); // 结束代码块

    // 运行时间检查 / Uptime check
    this.monitor.registerHealthCheck('uptime', async () => { // 访问 monitor
      const metrics = this.monitor.getMetrics(); // 定义常量 metrics
      // 运行时间大于 0 视为健康 / Uptime > 0 is healthy
      return metrics.uptime > 0; // 返回结果
    }); // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主入口 / Main Entry
// ============================================

// 创建服务实例 / Create service instance
const service = new MonitorService(); // 定义常量 service

// 启动服务 / Start service
service.start(); // 调用 service.start

// 优雅退出处理 / Graceful shutdown handling
process.on('SIGTERM', () => { // 注册事件监听
  console.log('[MonitorService] 收到 SIGTERM 信号 / Received SIGTERM'); // 控制台输出
  service.stop(); // 调用 service.stop
  process.exit(0); // 退出进程
}); // 结束代码块

process.on('SIGINT', () => { // 注册事件监听
  console.log('[MonitorService] 收到 SIGINT 信号 / Received SIGINT'); // 控制台输出
  service.stop(); // 调用 service.stop
  process.exit(0); // 退出进程
}); // 结束代码块

// 导出服务类 / Export service class
export { MonitorService }; // 导出命名成员
export default MonitorService; // 默认导出
