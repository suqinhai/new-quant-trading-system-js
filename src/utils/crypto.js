/**
 * API密钥加密存储模块
 * API Key Encryption Storage Module
 *
 * 使用AES-256-GCM加密算法保护敏感数据
 * Uses AES-256-GCM encryption to protect sensitive data
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 加密算法配置 / Encryption algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

// 加密文件路径 / Encrypted file path
const ENCRYPTED_KEYS_FILE = '.keys.enc';
const MASTER_KEY_ENV = 'MASTER_KEY';

/**
 * 从主密码派生加密密钥
 * Derive encryption key from master password
 * @param {string} masterPassword - 主密码 / Master password
 * @param {Buffer} salt - 盐值 / Salt
 * @returns {Buffer} 派生密钥 / Derived key
 */
function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(
    masterPassword,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * 加密数据
 * Encrypt data
 * @param {string} plaintext - 明文数据 / Plaintext data
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 加密后的数据 (Base64) / Encrypted data (Base64)
 */
export function encrypt(plaintext, masterPassword) {
  // 生成随机盐和IV / Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // 派生密钥 / Derive key
  const key = deriveKey(masterPassword, salt);

  // 创建加密器 / Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // 加密数据 / Encrypt data
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // 获取认证标签 / Get authentication tag
  const authTag = cipher.getAuthTag();

  // 组合: salt + iv + authTag + encrypted
  // Format: salt + iv + authTag + encrypted
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * 解密数据
 * Decrypt data
 * @param {string} encryptedData - 加密数据 (Base64) / Encrypted data (Base64)
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 解密后的数据 / Decrypted data
 */
export function decrypt(encryptedData, masterPassword) {
  // 解析Base64 / Parse Base64
  const combined = Buffer.from(encryptedData, 'base64');

  // 提取各部分 / Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // 派生密钥 / Derive key
  const key = deriveKey(masterPassword, salt);

  // 创建解密器 / Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // 解密数据 / Decrypt data
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('解密失败，主密码可能不正确 / Decryption failed, master password may be incorrect');
  }
}

/**
 * 加密API密钥对象
 * Encrypt API keys object
 * @param {Object} keys - API密钥对象 / API keys object
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 加密后的JSON字符串 / Encrypted JSON string
 */
export function encryptKeys(keys, masterPassword) {
  const jsonString = JSON.stringify(keys, null, 2);
  return encrypt(jsonString, masterPassword);
}

/**
 * 解密API密钥对象
 * Decrypt API keys object
 * @param {string} encryptedData - 加密数据 / Encrypted data
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {Object} API密钥对象 / API keys object
 */
export function decryptKeys(encryptedData, masterPassword) {
  const jsonString = decrypt(encryptedData, masterPassword);
  return JSON.parse(jsonString);
}

/**
 * 保存加密密钥到文件
 * Save encrypted keys to file
 * @param {Object} keys - API密钥对象 / API keys object
 * @param {string} masterPassword - 主密码 / Master password
 * @param {string} filePath - 文件路径 / File path
 */
export function saveEncryptedKeys(keys, masterPassword, filePath = ENCRYPTED_KEYS_FILE) {
  const encrypted = encryptKeys(keys, masterPassword);
  const fullPath = path.resolve(process.cwd(), filePath);

  // 写入加密文件 / Write encrypted file
  fs.writeFileSync(fullPath, encrypted, 'utf8');

  // 设置文件权限为仅所有者可读写 (Unix系统)
  // Set file permissions to owner read/write only (Unix systems)
  try {
    fs.chmodSync(fullPath, 0o600);
  } catch {
    // Windows系统忽略权限设置 / Ignore permission setting on Windows
  }

  return fullPath;
}

/**
 * 从文件加载加密密钥
 * Load encrypted keys from file
 * @param {string} masterPassword - 主密码 / Master password
 * @param {string} filePath - 文件路径 / File path
 * @returns {Object|null} API密钥对象或null / API keys object or null
 */
export function loadEncryptedKeys(masterPassword, filePath = ENCRYPTED_KEYS_FILE) {
  const fullPath = path.resolve(process.cwd(), filePath);

  // 检查文件是否存在 / Check if file exists
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  // 读取并解密 / Read and decrypt
  const encrypted = fs.readFileSync(fullPath, 'utf8');
  return decryptKeys(encrypted, masterPassword);
}

/**
 * 检查是否存在加密密钥文件
 * Check if encrypted keys file exists
 * @param {string} filePath - 文件路径 / File path
 * @returns {boolean} 是否存在 / Whether exists
 */
export function hasEncryptedKeys(filePath = ENCRYPTED_KEYS_FILE) {
  const fullPath = path.resolve(process.cwd(), filePath);
  return fs.existsSync(fullPath);
}

/**
 * 获取主密码
 * Get master password
 * 优先级: 参数 > 环境变量
 * Priority: argument > environment variable
 * @param {string} [password] - 可选密码参数 / Optional password argument
 * @returns {string|null} 主密码 / Master password
 */
export function getMasterPassword(password = null) {
  return password || process.env[MASTER_KEY_ENV] || null;
}

/**
 * 生成安全的随机主密码
 * Generate secure random master password
 * @param {number} length - 密码长度 / Password length
 * @returns {string} 随机密码 / Random password
 */
export function generateMasterPassword(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * 验证主密码强度
 * Validate master password strength
 * @param {string} password - 密码 / Password
 * @returns {Object} 验证结果 / Validation result
 */
export function validatePasswordStrength(password) {
  const result = {
    valid: true,
    score: 0,
    messages: [],
  };

  // 长度检查 / Length check
  if (password.length < 12) {
    result.valid = false;
    result.messages.push('密码长度至少12位 / Password must be at least 12 characters');
  } else if (password.length >= 16) {
    result.score += 2;
  } else {
    result.score += 1;
  }

  // 复杂度检查 / Complexity check
  if (/[A-Z]/.test(password)) result.score += 1;
  else result.messages.push('建议包含大写字母 / Should include uppercase letters');

  if (/[a-z]/.test(password)) result.score += 1;
  else result.messages.push('建议包含小写字母 / Should include lowercase letters');

  if (/[0-9]/.test(password)) result.score += 1;
  else result.messages.push('建议包含数字 / Should include numbers');

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) result.score += 2;
  else result.messages.push('建议包含特殊字符 / Should include special characters');

  // 评分等级 / Score level
  if (result.score >= 6) {
    result.level = 'strong';
  } else if (result.score >= 4) {
    result.level = 'medium';
  } else {
    result.level = 'weak';
    result.valid = false;
  }

  return result;
}

/**
 * 加密单个值（用于环境变量）
 * Encrypt single value (for environment variables)
 * @param {string} value - 值 / Value
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 加密值，带ENC前缀 / Encrypted value with ENC prefix
 */
export function encryptValue(value, masterPassword) {
  const encrypted = encrypt(value, masterPassword);
  return `ENC(${encrypted})`;
}

/**
 * 解密单个值（用于环境变量）
 * Decrypt single value (for environment variables)
 * @param {string} value - 加密值 / Encrypted value
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 解密值 / Decrypted value
 */
export function decryptValue(value, masterPassword) {
  // 检查是否是加密值 / Check if encrypted value
  const match = value.match(/^ENC\((.+)\)$/);
  if (!match) {
    return value; // 返回原值 / Return original value
  }

  return decrypt(match[1], masterPassword);
}

/**
 * 检查值是否已加密
 * Check if value is encrypted
 * @param {string} value - 值 / Value
 * @returns {boolean} 是否已加密 / Whether encrypted
 */
export function isEncrypted(value) {
  return typeof value === 'string' && /^ENC\(.+\)$/.test(value);
}

/**
 * 解密对象中的所有加密值
 * Decrypt all encrypted values in object
 * @param {Object} obj - 对象 / Object
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {Object} 解密后的对象 / Decrypted object
 */
export function decryptObject(obj, masterPassword) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const result = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (typeof value === 'string' && isEncrypted(value)) {
        result[key] = decryptValue(value, masterPassword);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = decryptObject(value, masterPassword);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

// 导出常量 / Export constants
export { ENCRYPTED_KEYS_FILE, MASTER_KEY_ENV };

// 默认导出 / Default export
export default {
  encrypt,
  decrypt,
  encryptKeys,
  decryptKeys,
  saveEncryptedKeys,
  loadEncryptedKeys,
  hasEncryptedKeys,
  getMasterPassword,
  generateMasterPassword,
  validatePasswordStrength,
  encryptValue,
  decryptValue,
  isEncrypted,
  decryptObject,
  ENCRYPTED_KEYS_FILE,
  MASTER_KEY_ENV,
};
