/**
 * 优雅关闭管理器
 * Graceful Shutdown Manager
 *
 * 处理进程信号，确保系统安全关闭
 * Handles process signals and ensures safe system shutdown
 *
 * @module src/lifecycle/GracefulShutdown
 */

import { EventEmitter } from 'events';

/**
 * 关闭阶段
 */
const ShutdownPhase = {
  RUNNING: 'running',
  STOPPING: 'stopping',
  DRAINING: 'draining',
  CLEANUP: 'cleanup',
  STOPPED: 'stopped',
};

/**
 * 优雅关闭管理器类
 * Graceful Shutdown Manager Class
 */
class GracefulShutdown extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 关闭超时时间 (ms)
      timeout: config.timeout || 30000,
      // 强制退出超时
      forceExitTimeout: config.forceExitTimeout || 5000,
      // 是否监听信号
      handleSignals: config.handleSignals ?? true,
      // 要处理的信号
      signals: config.signals || ['SIGTERM', 'SIGINT', 'SIGHUP'],
      // 是否在未捕获异常时关闭
      exitOnUncaughtException: config.exitOnUncaughtException ?? true,
      // 是否在未处理 Promise 拒绝时关闭
      exitOnUnhandledRejection: config.exitOnUnhandledRejection ?? true,
    };

    // 当前阶段
    this.phase = ShutdownPhase.RUNNING;

    // 注册的关闭处理器
    this.handlers = new Map();

    // 关闭原因
    this.shutdownReason = null;

    // 是否正在关闭
    this.isShuttingDown = false;

    // 设置信号处理
    if (this.config.handleSignals) {
      this._setupSignalHandlers();
    }

    // 设置异常处理
    this._setupExceptionHandlers();
  }

  /**
   * 设置信号处理
   * @private
   */
  _setupSignalHandlers() {
    for (const signal of this.config.signals) {
      process.on(signal, () => {
        console.log(`[GracefulShutdown] Received ${signal}`);
        this.shutdown(`signal:${signal}`);
      });
    }
  }

  /**
   * 设置异常处理
   * @private
   */
  _setupExceptionHandlers() {
    if (this.config.exitOnUncaughtException) {
      process.on('uncaughtException', (error) => {
        console.error('[GracefulShutdown] Uncaught exception:', error);
        this.shutdown('uncaughtException', error);
      });
    }

    if (this.config.exitOnUnhandledRejection) {
      process.on('unhandledRejection', (reason) => {
        console.error('[GracefulShutdown] Unhandled rejection:', reason);
        this.shutdown('unhandledRejection', reason);
      });
    }
  }

  /**
   * 注册关闭处理器
   * @param {string} name - 处理器名称
   * @param {Function} handler - 处理函数
   * @param {Object} options - 选项
   */
  register(name, handler, options = {}) {
    const priority = options.priority || 100;
    const timeout = options.timeout || this.config.timeout;

    this.handlers.set(name, {
      name,
      handler,
      priority,
      timeout,
      phase: options.phase || 'cleanup',
    });

    return () => this.unregister(name);
  }

  /**
   * 取消注册处理器
   * @param {string} name - 处理器名称
   */
  unregister(name) {
    this.handlers.delete(name);
  }

  /**
   * 执行优雅关闭
   * @param {string} reason - 关闭原因
   * @param {Error} error - 可选的错误对象
   */
  async shutdown(reason = 'manual', error = null) {
    if (this.isShuttingDown) {
      console.log('[GracefulShutdown] Already shutting down, ignoring');
      return;
    }

    this.isShuttingDown = true;
    this.shutdownReason = reason;

    console.log(`[GracefulShutdown] Starting shutdown (reason: ${reason})`);
    this.emit('shutdown:start', { reason, error });

    const startTime = Date.now();

    try {
      // 阶段 1: 停止接收新请求
      await this._executePhase(ShutdownPhase.STOPPING);

      // 阶段 2: 等待正在进行的请求完成
      await this._executePhase(ShutdownPhase.DRAINING);

      // 阶段 3: 清理资源
      await this._executePhase(ShutdownPhase.CLEANUP);

      this.phase = ShutdownPhase.STOPPED;

      const duration = Date.now() - startTime;
      console.log(`[GracefulShutdown] Shutdown complete (${duration}ms)`);
      this.emit('shutdown:complete', { reason, duration });

    } catch (shutdownError) {
      console.error('[GracefulShutdown] Error during shutdown:', shutdownError);
      this.emit('shutdown:error', { reason, error: shutdownError });

    } finally {
      // 设置强制退出定时器
      setTimeout(() => {
        console.log('[GracefulShutdown] Force exit');
        process.exit(error ? 1 : 0);
      }, this.config.forceExitTimeout);

      // 正常退出
      process.exit(error ? 1 : 0);
    }
  }

  /**
   * 执行关闭阶段
   * @private
   */
  async _executePhase(phaseName) {
    this.phase = phaseName;
    console.log(`[GracefulShutdown] Phase: ${phaseName}`);
    this.emit(`phase:${phaseName}`);

    // 获取该阶段的处理器
    const phaseHandlers = Array.from(this.handlers.values())
      .filter(h => h.phase === phaseName || phaseName === ShutdownPhase.CLEANUP)
      .sort((a, b) => a.priority - b.priority);

    // 并行执行处理器（带超时）
    const results = await Promise.allSettled(
      phaseHandlers.map(h => this._executeHandler(h))
    );

    // 记录失败的处理器
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `[GracefulShutdown] Handler "${phaseHandlers[index].name}" failed:`,
          result.reason
        );
      }
    });
  }

  /**
   * 执行单个处理器
   * @private
   */
  async _executeHandler(handlerInfo) {
    const { name, handler, timeout } = handlerInfo;

    console.log(`[GracefulShutdown] Running handler: ${name}`);

    return new Promise(async (resolve, reject) => {
      // 设置超时
      const timer = setTimeout(() => {
        reject(new Error(`Handler "${name}" timed out after ${timeout}ms`));
      }, timeout);

      try {
        await handler();
        clearTimeout(timer);
        console.log(`[GracefulShutdown] Handler "${name}" completed`);
        resolve();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      phase: this.phase,
      isShuttingDown: this.isShuttingDown,
      shutdownReason: this.shutdownReason,
      registeredHandlers: Array.from(this.handlers.keys()),
    };
  }
}

/**
 * 状态持久化管理器
 * State Persistence Manager
 */
class StatePersistence {
  constructor(config = {}) {
    this.config = {
      stateDir: config.stateDir || './data/state',
      saveInterval: config.saveInterval || 60000,
      enableAutoSave: config.enableAutoSave ?? true,
    };

    this.state = new Map();
    this.saveTimer = null;
    this.isDirty = false;

    // 确保目录存在
    this._ensureDir();

    // 启动自动保存
    if (this.config.enableAutoSave) {
      this._startAutoSave();
    }
  }

  /**
   * 确保状态目录存在
   * @private
   */
  _ensureDir() {
    const fs = require('fs');
    if (!fs.existsSync(this.config.stateDir)) {
      fs.mkdirSync(this.config.stateDir, { recursive: true });
    }
  }

  /**
   * 启动自动保存
   * @private
   */
  _startAutoSave() {
    this.saveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveAll();
      }
    }, this.config.saveInterval);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * 设置状态
   * @param {string} key - 状态键
   * @param {any} value - 状态值
   */
  set(key, value) {
    this.state.set(key, {
      value,
      updatedAt: Date.now(),
    });
    this.isDirty = true;
  }

  /**
   * 获取状态
   * @param {string} key - 状态键
   * @param {any} defaultValue - 默认值
   */
  get(key, defaultValue = null) {
    const entry = this.state.get(key);
    return entry ? entry.value : defaultValue;
  }

  /**
   * 删除状态
   * @param {string} key - 状态键
   */
  delete(key) {
    this.state.delete(key);
    this.isDirty = true;
  }

  /**
   * 保存单个状态到文件
   * @param {string} key - 状态键
   */
  save(key) {
    const fs = require('fs');
    const path = require('path');

    const entry = this.state.get(key);
    if (!entry) return false;

    const filename = path.join(this.config.stateDir, `${key}.json`);

    try {
      fs.writeFileSync(filename, JSON.stringify({
        key,
        ...entry,
        savedAt: Date.now(),
      }, null, 2));
      return true;
    } catch (error) {
      console.error(`[StatePersistence] Failed to save ${key}:`, error.message);
      return false;
    }
  }

  /**
   * 保存所有状态
   */
  saveAll() {
    const saved = [];
    const failed = [];

    for (const key of this.state.keys()) {
      if (this.save(key)) {
        saved.push(key);
      } else {
        failed.push(key);
      }
    }

    this.isDirty = false;

    return { saved, failed };
  }

  /**
   * 加载单个状态
   * @param {string} key - 状态键
   */
  load(key) {
    const fs = require('fs');
    const path = require('path');

    const filename = path.join(this.config.stateDir, `${key}.json`);

    try {
      if (!fs.existsSync(filename)) return null;

      const content = fs.readFileSync(filename, 'utf8');
      const data = JSON.parse(content);

      this.state.set(key, {
        value: data.value,
        updatedAt: data.updatedAt,
      });

      return data.value;
    } catch (error) {
      console.error(`[StatePersistence] Failed to load ${key}:`, error.message);
      return null;
    }
  }

  /**
   * 加载所有状态
   */
  loadAll() {
    const fs = require('fs');
    const path = require('path');

    const loaded = [];
    const failed = [];

    try {
      const files = fs.readdirSync(this.config.stateDir)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        const key = path.basename(file, '.json');
        if (this.load(key) !== null) {
          loaded.push(key);
        } else {
          failed.push(key);
        }
      }
    } catch (error) {
      console.error('[StatePersistence] Failed to load states:', error.message);
    }

    return { loaded, failed };
  }

  /**
   * 清除所有状态
   */
  clear() {
    this.state.clear();
    this.isDirty = false;
  }

  /**
   * 获取所有状态键
   */
  keys() {
    return Array.from(this.state.keys());
  }

  /**
   * 获取状态统计
   */
  getStats() {
    return {
      count: this.state.size,
      isDirty: this.isDirty,
      keys: this.keys(),
    };
  }
}

/**
 * 创建生命周期管理器
 * 集成优雅关闭和状态持久化
 */
function createLifecycleManager(config = {}) {
  const shutdown = new GracefulShutdown(config.shutdown);
  const persistence = new StatePersistence(config.persistence);

  // 注册状态保存处理器
  shutdown.register('state-persistence', async () => {
    console.log('[Lifecycle] Saving state before shutdown...');
    const result = persistence.saveAll();
    console.log(`[Lifecycle] Saved ${result.saved.length} states`);
  }, { priority: 10, phase: 'cleanup' });

  // 注册清理处理器
  shutdown.register('cleanup-timers', async () => {
    persistence.stopAutoSave();
  }, { priority: 100, phase: 'cleanup' });

  return {
    shutdown,
    persistence,

    /**
     * 注册组件关闭处理器
     */
    registerComponent(name, stopFn, options = {}) {
      return shutdown.register(name, stopFn, {
        priority: options.priority || 50,
        phase: options.phase || 'stopping',
        ...options,
      });
    },

    /**
     * 保存组件状态
     */
    saveState(componentName, state) {
      persistence.set(componentName, state);
    },

    /**
     * 加载组件状态
     */
    loadState(componentName, defaultValue = null) {
      return persistence.get(componentName, defaultValue);
    },

    /**
     * 启动时恢复状态
     */
    async restoreState() {
      const result = persistence.loadAll();
      console.log(`[Lifecycle] Restored ${result.loaded.length} states`);
      return result;
    },

    /**
     * 触发关闭
     */
    async initiateShutdown(reason = 'manual') {
      await shutdown.shutdown(reason);
    },

    /**
     * 获取状态
     */
    getStatus() {
      return {
        shutdown: shutdown.getStatus(),
        persistence: persistence.getStats(),
      };
    },
  };
}

export {
  GracefulShutdown,
  StatePersistence,
  ShutdownPhase,
  createLifecycleManager,
};

export default GracefulShutdown;
