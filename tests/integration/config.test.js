/**
 * 配置加载集成测试
 * Config Loading Integration Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

describe('Config Integration', () => {
  describe('Config Loading', () => {
    it('should load default config', async () => {
      const { loadConfig } = await import('../../config/index.js');
      const config = loadConfig();

      assert.ok(config.exchange);
      assert.ok(config.risk);
      assert.ok(config.logging);
    });

    it('should merge custom config', async () => {
      const { loadConfig } = await import('../../config/index.js');
      const customConfig = {
        custom: {
          testValue: 'test123',
        },
      };
      const config = loadConfig(customConfig);

      assert.strictEqual(config.custom.testValue, 'test123');
    });

    it('should have required config sections', async () => {
      const { loadConfig } = await import('../../config/index.js');
      const config = loadConfig();

      // Check required sections exist
      const requiredSections = [
        'exchange',
        'risk',
        'strategy',
        'logging',
        'server',
      ];

      for (const section of requiredSections) {
        assert.ok(config[section], `Missing config section: ${section}`);
      }
    });
  });

  describe('getConfig helper', () => {
    it('should get nested config values', async () => {
      const { getConfig } = await import('../../config/index.js');

      const level = getConfig('logging.level', 'info');
      assert.ok(typeof level === 'string');
    });

    it('should return default for missing path', async () => {
      const { getConfig } = await import('../../config/index.js');

      const value = getConfig('nonexistent.path', 'default');
      assert.strictEqual(value, 'default');
    });
  });
});

describe('Crypto Integration', () => {
  const testKeysFile = path.join(ROOT_DIR, '.keys.test.enc');
  const testPassword = 'TestPassword123!@#$';

  after(() => {
    // Cleanup test file
    if (fs.existsSync(testKeysFile)) {
      fs.unlinkSync(testKeysFile);
    }
  });

  describe('Key Storage', () => {
    it('should save and load encrypted keys', async () => {
      const { saveEncryptedKeys, loadEncryptedKeys } = await import(
        '../../src/utils/crypto.js'
      );

      const testKeys = {
        binance: {
          apiKey: 'test-binance-key',
          secret: 'test-binance-secret',
        },
        okx: {
          apiKey: 'test-okx-key',
          secret: 'test-okx-secret',
          passphrase: 'test-okx-pass',
        },
      };

      // Save
      saveEncryptedKeys(testKeys, testPassword, testKeysFile);
      assert.ok(fs.existsSync(testKeysFile));

      // Load
      const loaded = loadEncryptedKeys(testPassword, testKeysFile);
      assert.deepStrictEqual(loaded, testKeys);
    });

    it('should fail with wrong password', async () => {
      const { saveEncryptedKeys, loadEncryptedKeys } = await import(
        '../../src/utils/crypto.js'
      );

      const testKeys = { test: { key: 'value' } };
      saveEncryptedKeys(testKeys, testPassword, testKeysFile);

      assert.throws(() => {
        loadEncryptedKeys('WrongPassword123!', testKeysFile);
      });
    });
  });
});
