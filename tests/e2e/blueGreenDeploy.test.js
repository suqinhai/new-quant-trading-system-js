/**
 * 蓝绿部署验证 E2E 测试
 * Blue-Green Deployment E2E Tests
 *
 * 测试系统在蓝绿部署过程中的行为和数据一致性
 * @module tests/e2e/blueGreenDeploy.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import EventEmitter from 'events';

// ============================================
// 部署环境模拟器
// ============================================

class DeploymentEnvironment extends EventEmitter {
  constructor(name, config = {}) {
    super();
    this.name = name;
    this.config = {
      version: config.version || '1.0.0',
      ...config,
    };

    this.status = 'stopped';    // stopped, starting, running, stopping, draining
    this.health = 'unknown';     // unknown, healthy, unhealthy, degraded
    this.requestCount = 0;
    this.errorCount = 0;
    this.connections = new Set();
    this.data = new Map();
  }

  async start() {
    this.status = 'starting';
    this.emit('statusChange', { status: 'starting' });

    await testUtils.delay(50);

    this.status = 'running';
    this.health = 'healthy';
    this.emit('statusChange', { status: 'running' });
    this.emit('healthChange', { health: 'healthy' });

    return true;
  }

  async stop() {
    this.status = 'stopping';
    this.emit('statusChange', { status: 'stopping' });

    // 等待连接排空
    await this.drainConnections();

    this.status = 'stopped';
    this.health = 'unknown';
    this.emit('statusChange', { status: 'stopped' });

    return true;
  }

  async drainConnections() {
    this.status = 'draining';
    this.emit('statusChange', { status: 'draining' });

    // 模拟等待现有连接完成
    const drainPromises = Array.from(this.connections).map(async (conn) => {
      await testUtils.delay(Math.random() * 100);
      this.connections.delete(conn);
    });

    await Promise.all(drainPromises);
    this.emit('drained');
  }

  async handleRequest(request) {
    if (this.status !== 'running') {
      this.errorCount++;
      throw new Error(`Environment ${this.name} is not running`);
    }

    const connId = `conn_${Date.now()}_${Math.random()}`;
    this.connections.add(connId);

    try {
      this.requestCount++;

      // 模拟请求处理
      await testUtils.delay(10 + Math.random() * 20);

      // 模拟偶发错误
      if (Math.random() < 0.01) {
        this.errorCount++;
        throw new Error('Random request error');
      }

      return {
        success: true,
        environment: this.name,
        version: this.config.version,
        requestId: request.id,
      };
    } finally {
      this.connections.delete(connId);
    }
  }

  async healthCheck() {
    if (this.status !== 'running') {
      this.health = 'unhealthy';
      return false;
    }

    // 简单健康检查
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;

    if (errorRate > 0.1) {
      this.health = 'unhealthy';
    } else if (errorRate > 0.05) {
      this.health = 'degraded';
    } else {
      this.health = 'healthy';
    }

    this.emit('healthChange', { health: this.health, errorRate });
    return this.health === 'healthy';
  }

  setData(key, value) {
    this.data.set(key, value);
  }

  getData(key) {
    return this.data.get(key);
  }

  getAllData() {
    return new Map(this.data);
  }

  getMetrics() {
    return {
      name: this.name,
      version: this.config.version,
      status: this.status,
      health: this.health,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      activeConnections: this.connections.size,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
    };
  }

  reset() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.connections.clear();
    this.data.clear();
  }
}

// ============================================
// 蓝绿部署管理器
// ============================================

class BlueGreenDeployManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      healthCheckInterval: config.healthCheckInterval || 1000,
      healthCheckTimeout: config.healthCheckTimeout || 5000,
      minHealthyDuration: config.minHealthyDuration || 2000,
      trafficShiftSteps: config.trafficShiftSteps || 5,
      trafficShiftInterval: config.trafficShiftInterval || 100,
      rollbackOnFailure: config.rollbackOnFailure || true,
      ...config,
    };

    this.blue = null;
    this.green = null;
    this.activeEnvironment = null;
    this.trafficDistribution = { blue: 100, green: 0 };
    this.deploymentState = 'idle';  // idle, deploying, switching, rollingback
    this.deploymentHistory = [];
    this.healthCheckTimer = null;
  }

  async initialize(blueConfig, greenConfig) {
    this.blue = new DeploymentEnvironment('blue', blueConfig);
    this.green = new DeploymentEnvironment('green', greenConfig);

    // 启动蓝色环境作为默认
    await this.blue.start();
    this.activeEnvironment = 'blue';
    this.trafficDistribution = { blue: 100, green: 0 };

    this._startHealthCheck();

    this.emit('initialized', {
      active: 'blue',
      blueVersion: blueConfig.version,
      greenVersion: greenConfig.version,
    });
  }

  _startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      if (this.blue.status === 'running') {
        await this.blue.healthCheck();
      }
      if (this.green.status === 'running') {
        await this.green.healthCheck();
      }

      this.emit('healthCheckCompleted', {
        blue: this.blue.getMetrics(),
        green: this.green.getMetrics(),
      });
    }, this.config.healthCheckInterval);
  }

  _stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ============================================
  // 部署方法
  // ============================================

  async deploy(newVersion, targetEnv = null) {
    if (this.deploymentState !== 'idle') {
      throw new Error(`Deployment already in progress: ${this.deploymentState}`);
    }

    this.deploymentState = 'deploying';

    // 确定目标环境（非活跃环境）
    const target = targetEnv || (this.activeEnvironment === 'blue' ? 'green' : 'blue');
    const targetInstance = target === 'blue' ? this.blue : this.green;

    this.emit('deploymentStarted', {
      target,
      newVersion,
      previousVersion: targetInstance.config.version,
    });

    try {
      // 1. 停止目标环境（如果正在运行）
      if (targetInstance.status === 'running') {
        await targetInstance.stop();
      }

      // 2. 更新版本
      targetInstance.config.version = newVersion;

      // 3. 启动新版本
      await targetInstance.start();

      // 4. 等待健康检查通过
      const healthyStart = Date.now();
      let isHealthy = false;

      while (Date.now() - healthyStart < this.config.healthCheckTimeout) {
        isHealthy = await targetInstance.healthCheck();
        if (isHealthy) {
          // 确保持续健康
          await testUtils.delay(this.config.minHealthyDuration / 4);
          isHealthy = await targetInstance.healthCheck();
          if (isHealthy) break;
        }
        await testUtils.delay(100);
      }

      if (!isHealthy) {
        throw new Error('Health check failed after deployment');
      }

      this._recordDeployment({
        type: 'deploy',
        target,
        version: newVersion,
        success: true,
      });

      this.emit('deploymentCompleted', { target, version: newVersion });

      this.deploymentState = 'idle';
      return { success: true, target, version: newVersion };
    } catch (error) {
      this._recordDeployment({
        type: 'deploy',
        target,
        version: newVersion,
        success: false,
        error: error.message,
      });

      this.deploymentState = 'idle';
      this.emit('deploymentFailed', { target, error: error.message });
      throw error;
    }
  }

  async switchTraffic() {
    if (this.deploymentState !== 'idle') {
      throw new Error(`Cannot switch during: ${this.deploymentState}`);
    }

    const fromEnv = this.activeEnvironment;
    const toEnv = fromEnv === 'blue' ? 'green' : 'blue';
    const toInstance = toEnv === 'blue' ? this.blue : this.green;

    // 验证目标环境健康
    if (toInstance.status !== 'running' || toInstance.health !== 'healthy') {
      throw new Error(`Target environment ${toEnv} is not healthy`);
    }

    this.deploymentState = 'switching';

    this.emit('trafficSwitchStarted', { from: fromEnv, to: toEnv });

    try {
      // 渐进式切换流量
      const stepSize = 100 / this.config.trafficShiftSteps;

      for (let i = 1; i <= this.config.trafficShiftSteps; i++) {
        const toPercent = Math.min(100, Math.round(i * stepSize));
        const fromPercent = 100 - toPercent;

        this.trafficDistribution = {
          [fromEnv]: fromPercent,
          [toEnv]: toPercent,
        };

        this.emit('trafficShifted', {
          step: i,
          distribution: { ...this.trafficDistribution },
        });

        // 检查健康状态
        const isHealthy = await toInstance.healthCheck();
        if (!isHealthy && this.config.rollbackOnFailure) {
          throw new Error('Target environment became unhealthy during switch');
        }

        await testUtils.delay(this.config.trafficShiftInterval);
      }

      this.activeEnvironment = toEnv;

      this._recordDeployment({
        type: 'switch',
        from: fromEnv,
        to: toEnv,
        success: true,
      });

      this.emit('trafficSwitchCompleted', {
        active: toEnv,
        distribution: this.trafficDistribution,
      });

      this.deploymentState = 'idle';
      return { success: true, active: toEnv };
    } catch (error) {
      // 回滚
      if (this.config.rollbackOnFailure) {
        await this._rollbackTraffic(fromEnv);
      }

      this._recordDeployment({
        type: 'switch',
        from: fromEnv,
        to: toEnv,
        success: false,
        error: error.message,
      });

      this.emit('trafficSwitchFailed', { error: error.message });
      throw error;
    }
  }

  async _rollbackTraffic(toEnv) {
    this.deploymentState = 'rollingback';
    this.emit('rollbackStarted', { to: toEnv });

    this.trafficDistribution = {
      blue: toEnv === 'blue' ? 100 : 0,
      green: toEnv === 'green' ? 100 : 0,
    };

    this.activeEnvironment = toEnv;

    this._recordDeployment({
      type: 'rollback',
      to: toEnv,
      success: true,
    });

    this.emit('rollbackCompleted', { active: toEnv });
    this.deploymentState = 'idle';
  }

  async rollback() {
    const currentEnv = this.activeEnvironment;
    const previousEnv = currentEnv === 'blue' ? 'green' : 'blue';
    const previousInstance = previousEnv === 'blue' ? this.blue : this.green;

    // 检查之前的环境是否可用
    if (previousInstance.status !== 'running') {
      await previousInstance.start();
    }

    const isHealthy = await previousInstance.healthCheck();
    if (!isHealthy) {
      throw new Error(`Previous environment ${previousEnv} is not healthy`);
    }

    await this._rollbackTraffic(previousEnv);

    return { success: true, active: previousEnv };
  }

  // ============================================
  // 请求路由
  // ============================================

  routeRequest(request) {
    const random = Math.random() * 100;

    if (random < this.trafficDistribution.blue) {
      return this.blue;
    }
    return this.green;
  }

  async handleRequest(request) {
    const targetEnv = this.routeRequest(request);
    return targetEnv.handleRequest(request);
  }

  // ============================================
  // 数据同步
  // ============================================

  async syncData(fromEnv, toEnv) {
    const source = fromEnv === 'blue' ? this.blue : this.green;
    const target = toEnv === 'blue' ? this.blue : this.green;

    const data = source.getAllData();
    for (const [key, value] of data) {
      target.setData(key, value);
    }

    this.emit('dataSynced', {
      from: fromEnv,
      to: toEnv,
      keysCount: data.size,
    });

    return { keysCount: data.size };
  }

  async verifyDataConsistency() {
    const blueData = this.blue.getAllData();
    const greenData = this.green.getAllData();

    const inconsistencies = [];

    // 检查蓝色环境中的数据
    for (const [key, blueValue] of blueData) {
      const greenValue = greenData.get(key);
      if (JSON.stringify(blueValue) !== JSON.stringify(greenValue)) {
        inconsistencies.push({ key, blueValue, greenValue });
      }
    }

    // 检查绿色环境中特有的数据
    for (const [key] of greenData) {
      if (!blueData.has(key)) {
        inconsistencies.push({ key, blueValue: undefined, greenValue: greenData.get(key) });
      }
    }

    return {
      consistent: inconsistencies.length === 0,
      inconsistencies,
    };
  }

  // ============================================
  // 辅助方法
  // ============================================

  _recordDeployment(record) {
    this.deploymentHistory.push({
      ...record,
      timestamp: Date.now(),
    });
  }

  getDeploymentHistory() {
    return [...this.deploymentHistory];
  }

  getStatus() {
    return {
      deploymentState: this.deploymentState,
      activeEnvironment: this.activeEnvironment,
      trafficDistribution: { ...this.trafficDistribution },
      blue: this.blue?.getMetrics(),
      green: this.green?.getMetrics(),
    };
  }

  async shutdown() {
    this._stopHealthCheck();

    if (this.blue?.status === 'running') {
      await this.blue.stop();
    }
    if (this.green?.status === 'running') {
      await this.green.stop();
    }
  }
}

// ============================================
// 蓝绿部署 E2E 测试
// ============================================

describe('Blue-Green Deploy E2E', () => {
  let env;
  let deployManager;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 10000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance'],
    });
    await env.setup();

    deployManager = new BlueGreenDeployManager({
      healthCheckInterval: 100,
      healthCheckTimeout: 2000,
      minHealthyDuration: 100,
      trafficShiftSteps: 5,
      trafficShiftInterval: 50,
    });

    await deployManager.initialize(
      { version: '1.0.0' },
      { version: '1.0.0' }
    );

    await env.start();
  });

  afterEach(async () => {
    await deployManager.shutdown();
    await env.teardown();
  });

  // ============================================
  // 基础部署测试
  // ============================================

  describe('基础部署', () => {
    it('应该正确初始化蓝绿环境', () => {
      const status = deployManager.getStatus();

      expect(status.activeEnvironment).toBe('blue');
      expect(status.trafficDistribution.blue).toBe(100);
      expect(status.trafficDistribution.green).toBe(0);
      expect(status.blue.status).toBe('running');
    });

    it('应该能部署新版本到非活跃环境', async () => {
      const result = await deployManager.deploy('2.0.0');

      expect(result.success).toBe(true);
      expect(result.target).toBe('green');
      expect(result.version).toBe('2.0.0');

      const status = deployManager.getStatus();
      expect(status.green.version).toBe('2.0.0');
    });

    it('应该在部署后保持绿色环境运行', async () => {
      await deployManager.deploy('2.0.0');

      const status = deployManager.getStatus();
      expect(status.green.status).toBe('running');
      expect(status.green.health).toBe('healthy');
    });
  });

  // ============================================
  // 流量切换测试
  // ============================================

  describe('流量切换', () => {
    it('应该渐进式切换流量', async () => {
      await deployManager.deploy('2.0.0');

      const shiftEvents = [];
      deployManager.on('trafficShifted', (data) => shiftEvents.push(data));

      await deployManager.switchTraffic();

      expect(shiftEvents.length).toBe(5);
      expect(shiftEvents[4].distribution.green).toBe(100);
    });

    it('应该在切换完成后更新活跃环境', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      const status = deployManager.getStatus();
      expect(status.activeEnvironment).toBe('green');
      expect(status.trafficDistribution.green).toBe(100);
    });

    it('应该正确路由请求到新环境', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      const response = await deployManager.handleRequest({ id: 'req_1' });

      expect(response.environment).toBe('green');
      expect(response.version).toBe('2.0.0');
    });
  });

  // ============================================
  // 回滚测试
  // ============================================

  describe('回滚', () => {
    it('应该能回滚到之前的版本', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      expect(deployManager.activeEnvironment).toBe('green');

      const result = await deployManager.rollback();

      expect(result.success).toBe(true);
      expect(result.active).toBe('blue');
      expect(deployManager.trafficDistribution.blue).toBe(100);
    });

    it('应该在回滚后能正常处理请求', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();
      await deployManager.rollback();

      const response = await deployManager.handleRequest({ id: 'req_1' });

      expect(response.environment).toBe('blue');
      expect(response.version).toBe('1.0.0');
    });

    it('应该记录回滚历史', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();
      await deployManager.rollback();

      const history = deployManager.getDeploymentHistory();
      const rollbackRecord = history.find(h => h.type === 'rollback');

      expect(rollbackRecord).toBeDefined();
      expect(rollbackRecord.success).toBe(true);
    });
  });

  // ============================================
  // 健康检查测试
  // ============================================

  describe('健康检查', () => {
    it('应该定期执行健康检查', async () => {
      const healthEvents = [];
      deployManager.on('healthCheckCompleted', (data) => healthEvents.push(data));

      await testUtils.delay(300);

      expect(healthEvents.length).toBeGreaterThan(0);
    });

    it('应该在健康检查失败时拒绝流量切换', async () => {
      await deployManager.deploy('2.0.0');

      // 让绿色环境变得不健康
      deployManager.green.health = 'unhealthy';

      await expect(deployManager.switchTraffic()).rejects.toThrow('not healthy');
    });

    it('应该在切换过程中监控健康状态', async () => {
      await deployManager.deploy('2.0.0');

      // 在切换过程中模拟健康状态变化
      let switchStarted = false;
      deployManager.on('trafficSwitchStarted', () => {
        switchStarted = true;
      });

      const switchPromise = deployManager.switchTraffic();

      await switchPromise;

      expect(switchStarted).toBe(true);
    });
  });

  // ============================================
  // 数据一致性测试
  // ============================================

  describe('数据一致性', () => {
    it('应该能同步数据到新环境', async () => {
      // 在蓝色环境设置数据
      deployManager.blue.setData('order_1', { id: 1, amount: 100 });
      deployManager.blue.setData('position_1', { symbol: 'BTC/USDT', size: 0.5 });

      await deployManager.deploy('2.0.0');

      // 同步数据
      const result = await deployManager.syncData('blue', 'green');

      expect(result.keysCount).toBe(2);
      expect(deployManager.green.getData('order_1')).toEqual({ id: 1, amount: 100 });
    });

    it('应该验证数据一致性', async () => {
      deployManager.blue.setData('order_1', { id: 1 });
      deployManager.green.setData('order_1', { id: 1 });

      const result = await deployManager.verifyDataConsistency();

      expect(result.consistent).toBe(true);
    });

    it('应该检测到数据不一致', async () => {
      deployManager.blue.setData('order_1', { id: 1, amount: 100 });
      deployManager.green.setData('order_1', { id: 1, amount: 200 });

      const result = await deployManager.verifyDataConsistency();

      expect(result.consistent).toBe(false);
      expect(result.inconsistencies.length).toBe(1);
    });
  });

  // ============================================
  // 请求处理测试
  // ============================================

  describe('请求处理', () => {
    it('应该正确处理并发请求', async () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(deployManager.handleRequest({ id: `req_${i}` }));
      }

      const responses = await Promise.all(requests);

      expect(responses.every(r => r.success)).toBe(true);
      expect(responses.every(r => r.environment === 'blue')).toBe(true);
    });

    it('应该在流量切换时分配请求到两个环境', async () => {
      await deployManager.deploy('2.0.0');

      // 设置 50/50 流量分配
      deployManager.trafficDistribution = { blue: 50, green: 50 };

      const responses = [];
      for (let i = 0; i < 100; i++) {
        responses.push(await deployManager.handleRequest({ id: `req_${i}` }));
      }

      const blueCount = responses.filter(r => r.environment === 'blue').length;
      const greenCount = responses.filter(r => r.environment === 'green').length;

      // 应该大致均匀分配（允许一定偏差）
      expect(blueCount).toBeGreaterThan(30);
      expect(greenCount).toBeGreaterThan(30);
    });

    it('应该在环境停止时拒绝请求', async () => {
      await deployManager.blue.stop();

      await expect(
        deployManager.handleRequest({ id: 'req_1' })
      ).rejects.toThrow('not running');
    });
  });

  // ============================================
  // 连接排空测试
  // ============================================

  describe('连接排空', () => {
    it('应该在停止前排空连接', async () => {
      const drainedEvents = [];
      deployManager.blue.on('drained', () => drainedEvents.push(Date.now()));

      // 模拟一些活跃连接
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(deployManager.handleRequest({ id: `req_${i}` }));
      }

      // 在请求进行中停止
      const stopPromise = deployManager.blue.stop();

      await Promise.all([...requests, stopPromise].map(p => p.catch(() => {})));

      expect(drainedEvents.length).toBe(1);
    });

    it('应该在排空后才完成停止', async () => {
      const statusChanges = [];
      deployManager.blue.on('statusChange', (data) => statusChanges.push(data.status));

      await deployManager.blue.stop();

      expect(statusChanges).toContain('draining');
      expect(statusChanges[statusChanges.length - 1]).toBe('stopped');
    });
  });

  // ============================================
  // 部署历史测试
  // ============================================

  describe('部署历史', () => {
    it('应该记录所有部署操作', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();
      await deployManager.deploy('3.0.0', 'blue');

      const history = deployManager.getDeploymentHistory();

      expect(history.length).toBe(3);
      expect(history[0].type).toBe('deploy');
      expect(history[1].type).toBe('switch');
      expect(history[2].type).toBe('deploy');
    });

    it('应该记录失败的部署', async () => {
      // 让部署失败
      const originalStart = deployManager.green.start;
      deployManager.green.start = async () => {
        deployManager.green.status = 'running';
        deployManager.green.health = 'unhealthy';
      };

      try {
        await deployManager.deploy('2.0.0');
      } catch {
        // 预期失败
      }

      deployManager.green.start = originalStart;

      const history = deployManager.getDeploymentHistory();
      const failedDeploy = history.find(h => !h.success);

      expect(failedDeploy).toBeDefined();
      expect(failedDeploy.error).toBeDefined();
    });
  });

  // ============================================
  // 事件测试
  // ============================================

  describe('部署事件', () => {
    it('应该发出部署开始事件', async () => {
      const events = [];
      deployManager.on('deploymentStarted', (data) => events.push(data));

      await deployManager.deploy('2.0.0');

      expect(events.length).toBe(1);
      expect(events[0].newVersion).toBe('2.0.0');
    });

    it('应该发出部署完成事件', async () => {
      const events = [];
      deployManager.on('deploymentCompleted', (data) => events.push(data));

      await deployManager.deploy('2.0.0');

      expect(events.length).toBe(1);
      expect(events[0].version).toBe('2.0.0');
    });

    it('应该发出流量切换事件', async () => {
      const events = [];
      deployManager.on('trafficSwitchStarted', (data) => events.push(data));
      deployManager.on('trafficSwitchCompleted', (data) => events.push(data));

      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      expect(events.length).toBe(2);
    });

    it('应该发出回滚事件', async () => {
      const events = [];
      deployManager.on('rollbackStarted', (data) => events.push(data));
      deployManager.on('rollbackCompleted', (data) => events.push(data));

      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();
      await deployManager.rollback();

      expect(events.length).toBe(2);
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('应该拒绝并发部署', async () => {
      const deploy1 = deployManager.deploy('2.0.0');

      await expect(
        deployManager.deploy('3.0.0')
      ).rejects.toThrow('already in progress');

      await deploy1;
    });

    it('应该在部署进行中拒绝流量切换', async () => {
      const deploy = deployManager.deploy('2.0.0');

      // 立即尝试切换
      deployManager.deploymentState = 'deploying';

      await expect(
        deployManager.switchTraffic()
      ).rejects.toThrow('Cannot switch');

      deployManager.deploymentState = 'idle';
      await deploy;
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该处理完整的部署周期', async () => {
      // 1. 初始状态检查
      expect(deployManager.activeEnvironment).toBe('blue');

      // 2. 部署新版本
      await deployManager.deploy('2.0.0');

      // 3. 同步数据
      deployManager.blue.setData('key_1', { value: 'test' });
      await deployManager.syncData('blue', 'green');

      // 4. 切换流量
      await deployManager.switchTraffic();

      // 5. 验证
      expect(deployManager.activeEnvironment).toBe('green');
      expect(deployManager.green.getData('key_1')).toEqual({ value: 'test' });

      // 6. 处理请求
      const response = await deployManager.handleRequest({ id: 'req_1' });
      expect(response.version).toBe('2.0.0');

      // 7. 如需要，回滚
      await deployManager.rollback();
      expect(deployManager.activeEnvironment).toBe('blue');
    });

    it('应该在高负载下稳定运行', async () => {
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      // 高并发请求
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          deployManager.handleRequest({ id: `req_${i}` }).catch(() => null)
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r?.success).length;

      // 大部分请求应该成功
      expect(successCount).toBeGreaterThan(90);
    });

    it('应该正确处理多次部署', async () => {
      // 部署 v2
      await deployManager.deploy('2.0.0');
      await deployManager.switchTraffic();

      // 部署 v3
      await deployManager.deploy('3.0.0');
      await deployManager.switchTraffic();

      // 部署 v4
      await deployManager.deploy('4.0.0');
      await deployManager.switchTraffic();

      const history = deployManager.getDeploymentHistory();
      expect(history.filter(h => h.type === 'deploy').length).toBe(3);
      expect(history.filter(h => h.type === 'switch').length).toBe(3);
    });
  });
});
