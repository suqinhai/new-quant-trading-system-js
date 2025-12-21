/**
 * 配置管理测试
 * Configuration Management Tests
 * @module tests/unit/config.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager, ConfigSource } from '../../src/config/index.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const TEST_CONFIG_DIR = './test-config';

describe('ConfigManager', () => {
  let config;

  beforeEach(() => {
    config = new ConfigManager({
      configPath: TEST_CONFIG_DIR,
      envPrefix: 'TEST_',
      watchFiles: false,
      freeze: false,
    });
  });

  afterEach(() => {
    config.destroy();

    // 清理测试目录
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(config).toBeDefined();
      expect(config.options.configPath).toBe(TEST_CONFIG_DIR);
      expect(config.options.envPrefix).toBe('TEST_');
    });

    it('应该注册默认 Schema', () => {
      expect(config.schemas.has('exchange')).toBe(true);
      expect(config.schemas.has('risk')).toBe(true);
      expect(config.schemas.has('strategy')).toBe(true);
      expect(config.schemas.has('logging')).toBe(true);
    });
  });

  describe('Schema 注册', () => {
    it('应该注册自定义 Schema', () => {
      const customSchema = z.object({
        name: z.string(),
        value: z.number(),
      });

      config.registerSchema('custom', customSchema);

      expect(config.schemas.has('custom')).toBe(true);
    });
  });

  describe('配置加载', () => {
    it('应该加载默认配置', async () => {
      await config.load('test');

      expect(config.get('risk.enabled')).toBe(true);
      expect(config.get('risk.maxPositions')).toBe(5);
    });

    it('应该从文件加载配置', async () => {
      // 创建测试配置文件
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(TEST_CONFIG_DIR, 'default.json'),
        JSON.stringify({
          risk: {
            maxPositions: 10,
          },
        })
      );

      await config.load('test');

      expect(config.get('risk.maxPositions')).toBe(10);
    });

    it('应该按环境加载配置', async () => {
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

      fs.writeFileSync(
        path.join(TEST_CONFIG_DIR, 'default.json'),
        JSON.stringify({ risk: { maxPositions: 5 } })
      );

      fs.writeFileSync(
        path.join(TEST_CONFIG_DIR, 'production.json'),
        JSON.stringify({ risk: { maxPositions: 3 } })
      );

      await config.load('production');

      expect(config.get('risk.maxPositions')).toBe(3);
    });

    it('应该从环境变量加载配置', async () => {
      // 使用全小写的字段名（enabled）来测试环境变量加载
      process.env.TEST_RISK_ENABLED = 'false';

      await config.load('test');

      expect(config.get('risk.enabled')).toBe(false);

      delete process.env.TEST_RISK_ENABLED;
    });
  });

  describe('配置访问', () => {
    beforeEach(async () => {
      await config.load('test');
    });

    it('应该通过路径获取配置', () => {
      expect(config.get('risk.enabled')).toBe(true);
      expect(config.get('risk.maxDailyLoss')).toBe(1000);
    });

    it('应该返回默认值当配置不存在时', () => {
      expect(config.get('nonexistent.path', 'default')).toBe('default');
    });

    it('应该检查配置是否存在', () => {
      expect(config.has('risk.enabled')).toBe(true);
      expect(config.has('nonexistent')).toBe(false);
    });

    it('应该获取整个配置节', () => {
      const riskConfig = config.getSection('risk');

      expect(riskConfig.enabled).toBe(true);
      expect(riskConfig.maxPositions).toBeDefined();
    });

    it('应该获取所有配置', () => {
      const all = config.getAll();

      expect(all.risk).toBeDefined();
      expect(all.exchange).toBeDefined();
    });
  });

  describe('配置修改', () => {
    beforeEach(async () => {
      await config.load('test');
    });

    it('应该允许运行时修改配置', () => {
      config.set('risk.maxPositions', 20);

      expect(config.get('risk.maxPositions')).toBe(20);
    });

    it('应该验证修改的值', () => {
      // maxPositions 必须是正整数
      expect(() => config.set('risk.maxPositions', -1)).toThrow();
    });

    it('应该发射 changed 事件', () => {
      const handler = vi.fn();
      config.on('changed', handler);

      config.set('risk.maxPositions', 8);

      expect(handler).toHaveBeenCalledWith({
        keyPath: 'risk.maxPositions',
        oldValue: 5,
        newValue: 8,
      });
    });

    it('应该在禁用运行时修改时抛出错误', async () => {
      const frozenConfig = new ConfigManager({
        configPath: TEST_CONFIG_DIR,
        allowRuntimeChanges: false,
      });

      await frozenConfig.load('test');

      expect(() => frozenConfig.set('risk.maxPositions', 10)).toThrow('not allowed');

      frozenConfig.destroy();
    });
  });

  describe('配置冻结', () => {
    it('应该冻结配置', async () => {
      const frozenConfig = new ConfigManager({
        configPath: TEST_CONFIG_DIR,
        freeze: true,
      });

      await frozenConfig.load('test');

      expect(() => frozenConfig.set('risk.maxPositions', 10)).toThrow('frozen');

      frozenConfig.destroy();
    });
  });

  describe('配置保存', () => {
    beforeEach(async () => {
      await config.load('test');
    });

    it('应该保存配置到文件', () => {
      config.set('risk.maxPositions', 25);

      const filePath = config.save('custom.json');

      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(content.risk.maxPositions).toBe(25);
    });
  });

  describe('配置导出', () => {
    beforeEach(async () => {
      await config.load('test');
    });

    it('应该导出为 JSON 字符串', () => {
      const json = config.toJSON();

      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.risk).toBeDefined();
    });
  });

  describe('事件发射', () => {
    it('应该在加载时发射 loaded 事件', async () => {
      const handler = vi.fn();
      config.on('loaded', handler);

      await config.load('test');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].environment).toBe('test');
    });

    it('应该在重新加载时发射 reloaded 事件', async () => {
      await config.load('test');

      const handler = vi.fn();
      config.on('reloaded', handler);

      await config.reload();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('摘要信息', () => {
    beforeEach(async () => {
      await config.load('test');
    });

    it('应该返回配置摘要', () => {
      const summary = config.getSummary();

      expect(summary.sections.length).toBeGreaterThan(0);
      expect(summary.schemas.length).toBeGreaterThan(0);
      expect(summary.frozen).toBe(false);
    });
  });

  describe('环境变量解析', () => {
    it('应该解析布尔值', async () => {
      process.env.TEST_RISK_ENABLED = 'false';

      await config.load('test');

      expect(config.get('risk.enabled')).toBe(false);

      delete process.env.TEST_RISK_ENABLED;
    });

    it('应该解析数字', async () => {
      // 注意：环境变量键名会被转换为全小写
      // TEST_HEALTH_PORT -> health.port
      process.env.TEST_HEALTH_PORT = '9090';

      await config.load('test');

      expect(config.get('health.port')).toBe(9090);

      delete process.env.TEST_HEALTH_PORT;
    });
  });

  describe('深度合并', () => {
    it('应该正确合并嵌套配置', async () => {
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

      fs.writeFileSync(
        path.join(TEST_CONFIG_DIR, 'default.json'),
        JSON.stringify({
          exchange: {
            default: 'binance',
            binance: { sandbox: true },
          },
        })
      );

      fs.writeFileSync(
        path.join(TEST_CONFIG_DIR, 'test.json'),
        JSON.stringify({
          exchange: {
            binance: { timeout: 60000 },
          },
        })
      );

      await config.load('test');

      expect(config.get('exchange.default')).toBe('binance');
      expect(config.get('exchange.binance.sandbox')).toBe(true);
      expect(config.get('exchange.binance.timeout')).toBe(60000);
    });
  });
});

describe('ConfigManager 集成测试', () => {
  let config;

  beforeEach(() => {
    config = new ConfigManager({
      configPath: TEST_CONFIG_DIR,
      envPrefix: 'QUANT_',
    });
  });

  afterEach(() => {
    config.destroy();

    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  it('应该完成完整的配置生命周期', async () => {
    // 1. 创建配置文件
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(TEST_CONFIG_DIR, 'default.json'),
      JSON.stringify({
        risk: { maxPositions: 5 },
        strategy: { enabled: true },
      })
    );

    // 2. 加载配置
    await config.load('development');

    expect(config.get('risk.maxPositions')).toBe(5);

    // 3. 修改配置
    config.set('risk.maxPositions', 10);

    expect(config.get('risk.maxPositions')).toBe(10);

    // 4. 保存配置
    config.save('modified.json');

    // 5. 验证保存的文件
    const saved = JSON.parse(
      fs.readFileSync(path.join(TEST_CONFIG_DIR, 'modified.json'), 'utf8')
    );
    expect(saved.risk.maxPositions).toBe(10);

    // 6. 重新加载
    await config.reload();

    // 原始值应该恢复
    expect(config.get('risk.maxPositions')).toBe(5);
  });
});
