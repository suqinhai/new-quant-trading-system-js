/**
 * 加密模块单元测试
 * Crypto Module Unit Tests
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
  encrypt,
  decrypt,
  encryptKeys,
  decryptKeys,
  encryptValue,
  decryptValue,
  isEncrypted,
  generateMasterPassword,
  validatePasswordStrength,
  decryptObject,
} from '../../src/utils/crypto.js';

describe('Crypto Module', () => {
  const testPassword = 'TestPassword123!@#';
  const weakPassword = 'weak';

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);

      assert.strictEqual(decrypted, plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'Same text';
      const encrypted1 = encrypt(plaintext, testPassword);
      const encrypted2 = encrypt(plaintext, testPassword);

      assert.notStrictEqual(encrypted1, encrypted2);
    });

    it('should fail decryption with wrong password', () => {
      const plaintext = 'Secret data';
      const encrypted = encrypt(plaintext, testPassword);

      assert.throws(() => {
        decrypt(encrypted, 'WrongPassword123!');
      }, /解密失败|Decryption failed/);
    });

    it('should handle unicode characters', () => {
      const plaintext = '中文测试 🔐 émojis';
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);

      assert.strictEqual(decrypted, plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);

      assert.strictEqual(decrypted, plaintext);
    });
  });

  describe('encryptKeys / decryptKeys', () => {
    it('should encrypt and decrypt API keys object', () => {
      const keys = {
        binance: {
          apiKey: 'test-api-key-123',
          secret: 'test-secret-456',
        },
        okx: {
          apiKey: 'okx-key',
          secret: 'okx-secret',
          passphrase: 'okx-pass',
        },
      };

      const encrypted = encryptKeys(keys, testPassword);
      const decrypted = decryptKeys(encrypted, testPassword);

      assert.deepStrictEqual(decrypted, keys);
    });

    it('should handle nested objects', () => {
      const keys = {
        level1: {
          level2: {
            level3: 'deep-value',
          },
        },
      };

      const encrypted = encryptKeys(keys, testPassword);
      const decrypted = decryptKeys(encrypted, testPassword);

      assert.deepStrictEqual(decrypted, keys);
    });
  });

  describe('encryptValue / decryptValue', () => {
    it('should encrypt value with ENC() wrapper', () => {
      const value = 'api-key-123';
      const encrypted = encryptValue(value, testPassword);

      assert.match(encrypted, /^ENC\(.+\)$/);
    });

    it('should decrypt ENC() wrapped value', () => {
      const value = 'secret-value';
      const encrypted = encryptValue(value, testPassword);
      const decrypted = decryptValue(encrypted, testPassword);

      assert.strictEqual(decrypted, value);
    });

    it('should return original value if not encrypted', () => {
      const value = 'plain-text';
      const result = decryptValue(value, testPassword);

      assert.strictEqual(result, value);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for ENC() wrapped values', () => {
      assert.strictEqual(isEncrypted('ENC(somebase64data)'), true);
      assert.strictEqual(isEncrypted('ENC(abc123==)'), true);
    });

    it('should return false for plain values', () => {
      assert.strictEqual(isEncrypted('plain-text'), false);
      assert.strictEqual(isEncrypted('ENC('), false);
      assert.strictEqual(isEncrypted('ENC()'), false);
      assert.strictEqual(isEncrypted(''), false);
      assert.strictEqual(isEncrypted(null), false);
      assert.strictEqual(isEncrypted(undefined), false);
      assert.strictEqual(isEncrypted(123), false);
    });
  });

  describe('generateMasterPassword', () => {
    it('should generate password of specified length', () => {
      const password = generateMasterPassword(24);
      assert.strictEqual(password.length, 24);
    });

    it('should generate default 32-char password', () => {
      const password = generateMasterPassword();
      assert.strictEqual(password.length, 32);
    });

    it('should generate unique passwords', () => {
      const password1 = generateMasterPassword();
      const password2 = generateMasterPassword();

      assert.notStrictEqual(password1, password2);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should reject weak passwords', () => {
      const result = validatePasswordStrength(weakPassword);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.level, 'weak');
    });

    it('should accept strong passwords', () => {
      const result = validatePasswordStrength(testPassword);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.level, 'strong');
    });

    it('should require minimum 12 characters', () => {
      const result = validatePasswordStrength('Short1!');

      assert.strictEqual(result.valid, false);
      assert.ok(result.messages.some((m) => m.includes('12')));
    });

    it('should give higher score for complexity', () => {
      const simple = validatePasswordStrength('aaaaaaaaaaaa');
      const complex = validatePasswordStrength('Aa1!aaaaaaaa');

      assert.ok(complex.score > simple.score);
    });
  });

  describe('decryptObject', () => {
    it('should decrypt all encrypted values in object', () => {
      const original = {
        apiKey: 'key-123',
        secret: 'secret-456',
      };

      const encrypted = {
        apiKey: encryptValue(original.apiKey, testPassword),
        secret: encryptValue(original.secret, testPassword),
      };

      const decrypted = decryptObject(encrypted, testPassword);

      assert.deepStrictEqual(decrypted, original);
    });

    it('should handle mixed encrypted and plain values', () => {
      const obj = {
        encrypted: encryptValue('secret', testPassword),
        plain: 'plain-value',
        number: 123,
        bool: true,
      };

      const decrypted = decryptObject(obj, testPassword);

      assert.strictEqual(decrypted.encrypted, 'secret');
      assert.strictEqual(decrypted.plain, 'plain-value');
      assert.strictEqual(decrypted.number, 123);
      assert.strictEqual(decrypted.bool, true);
    });

    it('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            secret: encryptValue('nested-secret', testPassword),
          },
        },
      };

      const decrypted = decryptObject(obj, testPassword);

      assert.strictEqual(decrypted.level1.level2.secret, 'nested-secret');
    });

    it('should handle null and undefined', () => {
      assert.strictEqual(decryptObject(null, testPassword), null);
      assert.strictEqual(decryptObject(undefined, testPassword), undefined);
    });
  });
});
