/**
 * 优雅关闭管理器
 * Graceful Shutdown Manager
 *
 * 处理进程信号，确保系统安全关闭
 * Handles process signals and ensures safe system shutdown
 *
 * @module src/lifecycle/GracefulShutdown
 */

import { EventEmitter } from 'events'; // 导入模块 events
import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path

/**
 * 关闭阶段
 */
const ShutdownPhase = { // 定义常量 ShutdownPhase
  RUNNING: 'running', // 设置 RUNNING 字段
  STOPPING: 'stopping', // 设置 STOPPING 字段
  DRAINING: 'draining', // 设置 DRAINING 字段
  CLEANUP: 'cleanup', // 设置 CLEANUP 字段
  STOPPED: 'stopped', // 设置 STOPPED 字段
}; // 结束代码块

/**
 * 优雅关闭管理器类
 * Graceful Shutdown Manager Class
 */
class GracefulShutdown extends EventEmitter { // 定义类 GracefulShutdown(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // 关闭超时时间 (ms)
      timeout: config.timeout || 30000, // 设置 timeout 字段
      // 强制退出超时
      forceExitTimeout: config.forceExitTimeout || 5000, // 设置 forceExitTimeout 字段
      // 是否监听信号
      handleSignals: config.handleSignals ?? true, // 设置 handleSignals 字段
      // 要处理的信号
      signals: config.signals || ['SIGTERM', 'SIGINT', 'SIGHUP'], // 设置 signals 字段
      // 是否在未捕获异常时关闭
      exitOnUncaughtException: config.exitOnUncaughtException ?? true, // 设置 exitOnUncaughtException 字段
      // 是否在未处理 Promise 拒绝时关闭
      exitOnUnhandledRejection: config.exitOnUnhandledRejection ?? true, // 设置 exitOnUnhandledRejection 字段
    }; // 结束代码块

    // 当前阶段
    this.phase = ShutdownPhase.RUNNING; // 设置 phase

    // 注册的关闭处理器
    this.handlers = new Map(); // 设置 handlers

    // 关闭原因
    this.shutdownReason = null; // 设置 shutdownReason

    // 是否正在关闭
    this.isShuttingDown = false; // 设置 isShuttingDown

    // 设置信号处理
    if (this.config.handleSignals) { // 条件判断 this.config.handleSignals
      this._setupSignalHandlers(); // 调用 _setupSignalHandlers
    } // 结束代码块

    // 设置异常处理
    this._setupExceptionHandlers(); // 调用 _setupExceptionHandlers
  } // 结束代码块

  /**
   * 设置信号处理
   * @private
   */
  _setupSignalHandlers() { // 调用 _setupSignalHandlers
    for (const signal of this.config.signals) { // 循环 const signal of this.config.signals
      process.on(signal, () => { // 注册事件监听
        console.log(`[GracefulShutdown] Received ${signal}`); // 控制台输出
        this.shutdown(`signal:${signal}`); // 调用 shutdown
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置异常处理
   * @private
   */
  _setupExceptionHandlers() { // 调用 _setupExceptionHandlers
    if (this.config.exitOnUncaughtException) { // 条件判断 this.config.exitOnUncaughtException
      process.on('uncaughtException', (error) => { // 注册事件监听
        console.error('[GracefulShutdown] Uncaught exception:', error); // 控制台输出
        this.shutdown('uncaughtException', error); // 调用 shutdown
      }); // 结束代码块
    } // 结束代码块

    if (this.config.exitOnUnhandledRejection) { // 条件判断 this.config.exitOnUnhandledRejection
      process.on('unhandledRejection', (reason) => { // 注册事件监听
        console.error('[GracefulShutdown] Unhandled rejection:', reason); // 控制台输出
        this.shutdown('unhandledRejection', reason); // 调用 shutdown
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 注册关闭处理器
   * @param {string} name - 处理器名称
   * @param {Function} handler - 处理函数
   * @param {Object} options - 选项
   */
  register(name, handler, options = {}) { // 调用 register
    const priority = options.priority || 100; // 定义常量 priority
    const timeout = options.timeout || this.config.timeout; // 定义常量 timeout

    this.handlers.set(name, { // 访问 handlers
      name, // 执行语句
      handler, // 执行语句
      priority, // 执行语句
      timeout, // 执行语句
      phase: options.phase || 'cleanup', // 设置 phase 字段
    }); // 结束代码块

    return () => this.unregister(name); // 返回结果
  } // 结束代码块

  /**
   * 取消注册处理器
   * @param {string} name - 处理器名称
   */
  unregister(name) { // 调用 unregister
    this.handlers.delete(name); // 访问 handlers
  } // 结束代码块

  /**
   * 执行优雅关闭
   * @param {string} reason - 关闭原因
   * @param {Error} error - 可选的错误对象
   */
  async shutdown(reason = 'manual', error = null) { // 执行语句
    if (this.isShuttingDown) { // 条件判断 this.isShuttingDown
      console.log('[GracefulShutdown] Already shutting down, ignoring'); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    this.isShuttingDown = true; // 设置 isShuttingDown
    this.shutdownReason = reason; // 设置 shutdownReason

    console.log(`[GracefulShutdown] Starting shutdown (reason: ${reason})`); // 控制台输出
    this.emit('shutdown:start', { reason, error }); // 调用 emit

    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      // 阶段 1: 停止接收新请求
      await this._executePhase(ShutdownPhase.STOPPING); // 等待异步结果

      // 阶段 2: 等待正在进行的请求完成
      await this._executePhase(ShutdownPhase.DRAINING); // 等待异步结果

      // 阶段 3: 清理资源
      await this._executePhase(ShutdownPhase.CLEANUP); // 等待异步结果

      this.phase = ShutdownPhase.STOPPED; // 设置 phase

      const duration = Date.now() - startTime; // 定义常量 duration
      console.log(`[GracefulShutdown] Shutdown complete (${duration}ms)`); // 控制台输出
      this.emit('shutdown:complete', { reason, duration }); // 调用 emit

    } catch (shutdownError) { // 执行语句
      console.error('[GracefulShutdown] Error during shutdown:', shutdownError); // 控制台输出
      this.emit('shutdown:error', { reason, error: shutdownError }); // 调用 emit

    } finally { // 执行语句
      // 设置强制退出定时器
      setTimeout(() => { // 设置延时任务
        console.log('[GracefulShutdown] Force exit'); // 控制台输出
        process.exit(error ? 1 : 0); // 退出进程
      }, this.config.forceExitTimeout); // 执行语句

      // 正常退出
      process.exit(error ? 1 : 0); // 退出进程
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行关闭阶段
   * @private
   */
  async _executePhase(phaseName) { // 执行语句
    this.phase = phaseName; // 设置 phase
    console.log(`[GracefulShutdown] Phase: ${phaseName}`); // 控制台输出
    this.emit(`phase:${phaseName}`); // 调用 emit

    // 获取该阶段的处理器
    const phaseHandlers = Array.from(this.handlers.values()) // 定义常量 phaseHandlers
      .filter(h => h.phase === phaseName || phaseName === ShutdownPhase.CLEANUP) // 定义箭头函数
      .sort((a, b) => a.priority - b.priority); // 定义箭头函数

    // 并行执行处理器（带超时）
    const results = await Promise.allSettled( // 定义常量 results
      phaseHandlers.map(h => this._executeHandler(h)) // 调用 phaseHandlers.map
    ); // 结束调用或参数

    // 记录失败的处理器
    results.forEach((result, index) => { // 调用 results.forEach
      if (result.status === 'rejected') { // 条件判断 result.status === 'rejected'
        console.error( // 控制台输出
          `[GracefulShutdown] Handler "${phaseHandlers[index].name}" failed:`, // 执行语句
          result.reason // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 执行单个处理器
   * @private
   */
  async _executeHandler(handlerInfo) { // 执行语句
    const { name, handler, timeout } = handlerInfo; // 解构赋值

    console.log(`[GracefulShutdown] Running handler: ${name}`); // 控制台输出

    return new Promise(async (resolve, reject) => { // 返回结果
      // 设置超时
      const timer = setTimeout(() => { // 定义函数 timer
        reject(new Error(`Handler "${name}" timed out after ${timeout}ms`)); // 调用 reject
      }, timeout); // 执行语句

      try { // 尝试执行
        await handler(); // 等待异步结果
        clearTimeout(timer); // 调用 clearTimeout
        console.log(`[GracefulShutdown] Handler "${name}" completed`); // 控制台输出
        resolve(); // 调用 resolve
      } catch (error) { // 执行语句
        clearTimeout(timer); // 调用 clearTimeout
        reject(error); // 调用 reject
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取当前状态
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      phase: this.phase, // 设置 phase 字段
      isShuttingDown: this.isShuttingDown, // 设置 isShuttingDown 字段
      shutdownReason: this.shutdownReason, // 设置 shutdownReason 字段
      registeredHandlers: Array.from(this.handlers.keys()), // 设置 registeredHandlers 字段
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 状态持久化管理器
 * State Persistence Manager
 */
class StatePersistence { // 定义类 StatePersistence
  constructor(config = {}) { // 构造函数
    this.config = { // 设置 config
      stateDir: config.stateDir || './data/state', // 设置 stateDir 字段
      saveInterval: config.saveInterval || 60000, // 设置 saveInterval 字段
      enableAutoSave: config.enableAutoSave ?? true, // 设置 enableAutoSave 字段
    }; // 结束代码块

    this.state = new Map(); // 设置 state
    this.saveTimer = null; // 设置 saveTimer
    this.isDirty = false; // 设置 isDirty

    // 确保目录存在
    this._ensureDir(); // 调用 _ensureDir

    // 启动自动保存
    if (this.config.enableAutoSave) { // 条件判断 this.config.enableAutoSave
      this._startAutoSave(); // 调用 _startAutoSave
    } // 结束代码块
  } // 结束代码块

  /**
   * 确保状态目录存在
   * @private
   */
  _ensureDir() { // 调用 _ensureDir
    if (!fs.existsSync(this.config.stateDir)) { // 条件判断 !fs.existsSync(this.config.stateDir)
      fs.mkdirSync(this.config.stateDir, { recursive: true }); // 调用 fs.mkdirSync
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动自动保存
   * @private
   */
  _startAutoSave() { // 调用 _startAutoSave
    this.saveTimer = setInterval(() => { // 设置 saveTimer
      if (this.isDirty) { // 条件判断 this.isDirty
        this.saveAll(); // 调用 saveAll
      } // 结束代码块
    }, this.config.saveInterval); // 执行语句
  } // 结束代码块

  /**
   * 停止自动保存
   */
  stopAutoSave() { // 调用 stopAutoSave
    if (this.saveTimer) { // 条件判断 this.saveTimer
      clearInterval(this.saveTimer); // 调用 clearInterval
      this.saveTimer = null; // 设置 saveTimer
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置状态
   * @param {string} key - 状态键
   * @param {any} value - 状态值
   */
  set(key, value) { // 调用 set
    this.state.set(key, { // 访问 state
      value, // 执行语句
      updatedAt: Date.now(), // 设置 updatedAt 字段
    }); // 结束代码块
    this.isDirty = true; // 设置 isDirty
  } // 结束代码块

  /**
   * 获取状态
   * @param {string} key - 状态键
   * @param {any} defaultValue - 默认值
   */
  get(key, defaultValue = null) { // 调用 get
    const entry = this.state.get(key); // 定义常量 entry
    return entry ? entry.value : defaultValue; // 返回结果
  } // 结束代码块

  /**
   * 删除状态
   * @param {string} key - 状态键
   */
  delete(key) { // 调用 delete
    this.state.delete(key); // 访问 state
    this.isDirty = true; // 设置 isDirty
  } // 结束代码块

  /**
   * 保存单个状态到文件
   * @param {string} key - 状态键
   */
  save(key) { // 调用 save
    const entry = this.state.get(key); // 定义常量 entry
    if (!entry) return false; // 条件判断 !entry

    const filename = path.join(this.config.stateDir, `${key}.json`); // 定义常量 filename

    try { // 尝试执行
      fs.writeFileSync(filename, JSON.stringify({ // 调用 fs.writeFileSync
        key, // 执行语句
        ...entry, // 展开对象或数组
        savedAt: Date.now(), // 设置 savedAt 字段
      }, null, 2)); // 执行语句
      return true; // 返回结果
    } catch (error) { // 执行语句
      console.error(`[StatePersistence] Failed to save ${key}:`, error.message); // 控制台输出
      return false; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 保存所有状态
   */
  saveAll() { // 调用 saveAll
    const saved = []; // 定义常量 saved
    const failed = []; // 定义常量 failed

    for (const key of this.state.keys()) { // 循环 const key of this.state.keys()
      if (this.save(key)) { // 条件判断 this.save(key)
        saved.push(key); // 调用 saved.push
      } else { // 执行语句
        failed.push(key); // 调用 failed.push
      } // 结束代码块
    } // 结束代码块

    this.isDirty = false; // 设置 isDirty

    return { saved, failed }; // 返回结果
  } // 结束代码块

  /**
   * 加载单个状态
   * @param {string} key - 状态键
   */
  load(key) { // 调用 load
    const filename = path.join(this.config.stateDir, `${key}.json`); // 定义常量 filename

    try { // 尝试执行
      if (!fs.existsSync(filename)) return null; // 条件判断 !fs.existsSync(filename)

      const content = fs.readFileSync(filename, 'utf8'); // 定义常量 content
      const data = JSON.parse(content); // 定义常量 data

      this.state.set(key, { // 访问 state
        value: data.value, // 设置 value 字段
        updatedAt: data.updatedAt, // 设置 updatedAt 字段
      }); // 结束代码块

      return data.value; // 返回结果
    } catch (error) { // 执行语句
      console.error(`[StatePersistence] Failed to load ${key}:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 加载所有状态
   */
  loadAll() { // 调用 loadAll
    const loaded = []; // 定义常量 loaded
    const failed = []; // 定义常量 failed

    try { // 尝试执行
      const files = fs.readdirSync(this.config.stateDir) // 定义常量 files
        .filter(f => f.endsWith('.json')); // 定义箭头函数

      for (const file of files) { // 循环 const file of files
        const key = path.basename(file, '.json'); // 定义常量 key
        if (this.load(key) !== null) { // 条件判断 this.load(key) !== null
          loaded.push(key); // 调用 loaded.push
        } else { // 执行语句
          failed.push(key); // 调用 failed.push
        } // 结束代码块
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error('[StatePersistence] Failed to load states:', error.message); // 控制台输出
    } // 结束代码块

    return { loaded, failed }; // 返回结果
  } // 结束代码块

  /**
   * 清除所有状态
   */
  clear() { // 调用 clear
    this.state.clear(); // 访问 state
    this.isDirty = false; // 设置 isDirty
  } // 结束代码块

  /**
   * 获取所有状态键
   */
  keys() { // 调用 keys
    return Array.from(this.state.keys()); // 返回结果
  } // 结束代码块

  /**
   * 获取状态统计
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      count: this.state.size, // 设置 count 字段
      isDirty: this.isDirty, // 设置 isDirty 字段
      keys: this.keys(), // 设置 keys 字段
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 创建生命周期管理器
 * 集成优雅关闭和状态持久化
 */
function createLifecycleManager(config = {}) { // 定义函数 createLifecycleManager
  const shutdown = new GracefulShutdown(config.shutdown); // 定义常量 shutdown
  const persistence = new StatePersistence(config.persistence); // 定义常量 persistence

  // 注册状态保存处理器
  shutdown.register('state-persistence', async () => { // 调用 shutdown.register
    console.log('[Lifecycle] Saving state before shutdown...'); // 控制台输出
    const result = persistence.saveAll(); // 定义常量 result
    console.log(`[Lifecycle] Saved ${result.saved.length} states`); // 控制台输出
  }, { priority: 10, phase: 'cleanup' }); // 执行语句

  // 注册清理处理器
  shutdown.register('cleanup-timers', async () => { // 调用 shutdown.register
    persistence.stopAutoSave(); // 调用 persistence.stopAutoSave
  }, { priority: 100, phase: 'cleanup' }); // 执行语句

  return { // 返回结果
    shutdown, // 执行语句
    persistence, // 执行语句

    /**
     * 注册组件关闭处理器
     */
    registerComponent(name, stopFn, options = {}) { // 调用 registerComponent
      return shutdown.register(name, stopFn, { // 返回结果
        priority: options.priority || 50, // 设置 priority 字段
        phase: options.phase || 'stopping', // 设置 phase 字段
        ...options, // 展开对象或数组
      }); // 结束代码块
    }, // 结束代码块

    /**
     * 保存组件状态
     */
    saveState(componentName, state) { // 调用 saveState
      persistence.set(componentName, state); // 调用 persistence.set
    }, // 结束代码块

    /**
     * 加载组件状态
     */
    loadState(componentName, defaultValue = null) { // 调用 loadState
      return persistence.get(componentName, defaultValue); // 返回结果
    }, // 结束代码块

    /**
     * 启动时恢复状态
     */
    async restoreState() { // 执行语句
      const result = persistence.loadAll(); // 定义常量 result
      console.log(`[Lifecycle] Restored ${result.loaded.length} states`); // 控制台输出
      return result; // 返回结果
    }, // 结束代码块

    /**
     * 触发关闭
     */
    async initiateShutdown(reason = 'manual') { // 执行语句
      await shutdown.shutdown(reason); // 等待异步结果
    }, // 结束代码块

    /**
     * 获取状态
     */
    getStatus() { // 调用 getStatus
      return { // 返回结果
        shutdown: shutdown.getStatus(), // 设置 shutdown 字段
        persistence: persistence.getStats(), // 设置 persistence 字段
      }; // 结束代码块
    }, // 结束代码块
  }; // 结束代码块
} // 结束代码块

export { // 导出命名成员
  GracefulShutdown, // 执行语句
  StatePersistence, // 执行语句
  ShutdownPhase, // 执行语句
  createLifecycleManager, // 执行语句
}; // 结束代码块

export default GracefulShutdown; // 默认导出
