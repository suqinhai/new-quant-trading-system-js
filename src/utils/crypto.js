/**
 * API密钥加密存储模块
 * API Key Encryption Storage Module
 *
 * 使用AES-256-GCM加密算法保护敏感数据
 * Uses AES-256-GCM encryption to protect sensitive data
 */

import crypto from 'crypto'; // 导入模块 crypto
import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path

// 加密算法配置 / Encryption algorithm configuration
const ALGORITHM = 'aes-256-gcm'; // 定义常量 ALGORITHM
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 定义常量 SALT_LENGTH
const PBKDF2_ITERATIONS = 100000; // 定义常量 PBKDF2_ITERATIONS

// 加密文件路径 / Encrypted file path
const ENCRYPTED_KEYS_FILE = '.keys.enc'; // 定义常量 ENCRYPTED_KEYS_FILE
const MASTER_KEY_ENV = 'MASTER_KEY'; // 定义常量 MASTER_KEY_ENV

/**
 * 从主密码派生加密密钥
 * Derive encryption key from master password
 * @param {string} masterPassword - 主密码 / Master password
 * @param {Buffer} salt - 盐值 / Salt
 * @returns {Buffer} 派生密钥 / Derived key
 */
function deriveKey(masterPassword, salt) { // 定义函数 deriveKey
  return crypto.pbkdf2Sync( // 返回结果
    masterPassword, // 执行语句
    salt, // 执行语句
    PBKDF2_ITERATIONS, // 执行语句
    KEY_LENGTH, // 执行语句
    'sha512' // 执行语句
  ); // 结束调用或参数
} // 结束代码块

/**
 * 加密数据
 * Encrypt data
 * @param {string} plaintext - 明文数据 / Plaintext data
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 加密后的数据 (Base64) / Encrypted data (Base64)
 */
export function encrypt(plaintext, masterPassword) { // 导出函数 encrypt
  // 生成随机盐和IV / Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH); // 定义常量 salt
  const iv = crypto.randomBytes(IV_LENGTH); // 定义常量 iv

  // 派生密钥 / Derive key
  const key = deriveKey(masterPassword, salt); // 定义常量 key

  // 创建加密器 / Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv); // 定义常量 cipher

  // 加密数据 / Encrypt data
  const encrypted = Buffer.concat([ // 定义常量 encrypted
    cipher.update(plaintext, 'utf8'), // 调用 cipher.update
    cipher.final(), // 调用 cipher.final
  ]); // 结束数组或索引

  // 获取认证标签 / Get authentication tag
  const authTag = cipher.getAuthTag(); // 定义常量 authTag

  // 组合: salt + iv + authTag + encrypted
  // Format: salt + iv + authTag + encrypted
  const combined = Buffer.concat([salt, iv, authTag, encrypted]); // 定义常量 combined

  return combined.toString('base64'); // 返回结果
} // 结束代码块

/**
 * 解密数据
 * Decrypt data
 * @param {string} encryptedData - 加密数据 (Base64) / Encrypted data (Base64)
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 解密后的数据 / Decrypted data
 */
export function decrypt(encryptedData, masterPassword) { // 导出函数 decrypt
  // 解析Base64 / Parse Base64
  const combined = Buffer.from(encryptedData, 'base64'); // 定义常量 combined

  // 提取各部分 / Extract components
  const salt = combined.subarray(0, SALT_LENGTH); // 定义常量 salt
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH); // 定义常量 iv
  const authTag = combined.subarray( // 定义常量 authTag
    SALT_LENGTH + IV_LENGTH, // 执行语句
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH // 执行语句
  ); // 结束调用或参数
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH); // 定义常量 encrypted

  // 派生密钥 / Derive key
  const key = deriveKey(masterPassword, salt); // 定义常量 key

  // 创建解密器 / Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv); // 定义常量 decipher
  decipher.setAuthTag(authTag); // 调用 decipher.setAuthTag

  // 解密数据 / Decrypt data
  try { // 尝试执行
    const decrypted = Buffer.concat([ // 定义常量 decrypted
      decipher.update(encrypted), // 调用 decipher.update
      decipher.final(), // 调用 decipher.final
    ]); // 结束数组或索引
    return decrypted.toString('utf8'); // 返回结果
  } catch (error) { // 执行语句
    throw new Error('解密失败，主密码可能不正确 / Decryption failed, master password may be incorrect'); // 抛出异常
  } // 结束代码块
} // 结束代码块

/**
 * 加密API密钥对象
 * Encrypt API keys object
 * @param {Object} keys - API密钥对象 / API keys object
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {string} 加密后的JSON字符串 / Encrypted JSON string
 */
export function encryptKeys(keys, masterPassword) { // 导出函数 encryptKeys
  const jsonString = JSON.stringify(keys, null, 2); // 定义常量 jsonString
  return encrypt(jsonString, masterPassword); // 返回结果
} // 结束代码块

/**
 * 解密API密钥对象
 * Decrypt API keys object
 * @param {string} encryptedData - 加密数据 / Encrypted data
 * @param {string} masterPassword - 主密码 / Master password
 * @returns {Object} API密钥对象 / API keys object
 */
export function decryptKeys(encryptedData, masterPassword) { // 导出函数 decryptKeys
  const jsonString = decrypt(encryptedData, masterPassword); // 定义常量 jsonString
  return JSON.parse(jsonString); // 返回结果
} // 结束代码块

/**
 * 保存加密密钥到文件
 * Save encrypted keys to file
 * @param {Object} keys - API密钥对象 / API keys object
 * @param {string} masterPassword - 主密码 / Master password
 * @param {string} filePath - 文件路径 / File path
 */
export function saveEncryptedKeys(keys, masterPassword, filePath = ENCRYPTED_KEYS_FILE) { // 导出函数 saveEncryptedKeys
  const encrypted = encryptKeys(keys, masterPassword); // 定义常量 encrypted
  const fullPath = path.resolve(process.cwd(), filePath); // 定义常量 fullPath

  // 写入加密文件 / Write encrypted file
  fs.writeFileSync(fullPath, encrypted, 'utf8'); // 调用 fs.writeFileSync

  // 设置文件权限为仅所有者可读写 (Unix系统)
  // Set file permissions to owner read/write only (Unix systems)
  try { // 尝试执行
    fs.chmodSync(fullPath, 0o600); // 调用 fs.chmodSync
  } catch { // 执行语句
    // Windows系统忽略权限设置 / Ignore permission setting on Windows
  } // 结束代码块

  return fullPath; // 返回结果
} // 结束代码块

/**
 * 从文件加载加密密钥
 * Load encrypted keys from file
 * @param {string} masterPassword - 主密码 / Master password
 * @param {string} filePath - 文件路径 / File path
 * @returns {Object|null} API密钥对象或null / API keys object or null
 */
export function loadEncryptedKeys(masterPassword, filePath = ENCRYPTED_KEYS_FILE) { // 导出函数 loadEncryptedKeys
  const fullPath = path.resolve(process.cwd(), filePath); // 定义常量 fullPath

  // 检查文件是否存在 / Check if file exists
  if (!fs.existsSync(fullPath)) { // 条件判断 !fs.existsSync(fullPath)
    return null; // 返回结果
  } // 结束代码块

  // 读取并解密 / Read and decrypt
  const encrypted = fs.readFileSync(fullPath, 'utf8'); // 定义常量 encrypted
  return decryptKeys(encrypted, masterPassword); // 返回结果
} // 结束代码块

/**
 * 检查是否存在加密密钥文件
 * Check if encrypted keys file exists
 * @param {string} filePath - 文件路径 / File path
 * @returns {boolean} 是否存在 / Whether exists
 */
export function hasEncryptedKeys(filePath = ENCRYPTED_KEYS_FILE) { // 导出函数 hasEncryptedKeys
  const fullPath = path.resolve(process.cwd(), filePath); // 定义常量 fullPath
  return fs.existsSync(fullPath); // 返回结果
} // 结束代码块

/**
 * 获取主密码
 * Get master password
 * 优先级: 参数 > 环境变量
 * Priority: argument > environment variable
 * @param {string} [password] - 可选密码参数 / Optional password argument
 * @returns {string|null} 主密码 / Master password
 */
export function getMasterPassword(password = null) { // 导出函数 getMasterPassword
  return password || process.env[MASTER_KEY_ENV] || null; // 返回结果
} // 结束代码块

/**
 * 生成安全的随机主密码
 * Generate secure random master password
 * @param {number} length - 密码长度 / Password length
 * @returns {string} 随机密码 / Random password
 */
export function generateMasterPassword(length = 32) { // 导出函数 generateMasterPassword
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'; // 定义常量 charset
  const randomBytes = crypto.randomBytes(length); // 定义常量 randomBytes
  let password = ''; // 定义变量 password

  for (let i = 0; i < length; i++) { // 循环 let i = 0; i < length; i++
    password += charset[randomBytes[i] % charset.length]; // 执行语句
  } // 结束代码块

  return password; // 返回结果
} // 结束代码块

/**
 * 验证主密码强度
 * Validate master password strength
 * @param {string} password - 密码 / Password
 * @returns {Object} 验证结果 / Validation result
 */
export function validatePasswordStrength(password) { // 导出函数 validatePasswordStrength
  const result = { // 定义常量 result
    valid: true, // 设置 valid 字段
    score: 0, // 设置 score 字段
    messages: [], // 设置 messages 字段
  }; // 结束代码块

  // 长度检查 / Length check
  if (password.length < 12) { // 条件判断 password.length < 12
    result.valid = false; // 赋值 result.valid
    result.messages.push('密码长度至少12位 / Password must be at least 12 characters'); // 调用 result.messages.push
  } else if (password.length >= 16) { // 执行语句
    result.score += 2; // 执行语句
  } else { // 执行语句
    result.score += 1; // 执行语句
  } // 结束代码块

  // 复杂度检查 / Complexity check
  if (/[A-Z]/.test(password)) result.score += 1; // 条件判断 /[A-Z]/.test(password)
  else result.messages.push('建议包含大写字母 / Should include uppercase letters'); // 否则分支

  if (/[a-z]/.test(password)) result.score += 1; // 条件判断 /[a-z]/.test(password)
  else result.messages.push('建议包含小写字母 / Should include lowercase letters'); // 否则分支

  if (/[0-9]/.test(password)) result.score += 1; // 条件判断 /[0-9]/.test(password)
  else result.messages.push('建议包含数字 / Should include numbers'); // 否则分支

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
