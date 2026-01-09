#!/usr/bin/env node
/**
 * API密钥管理工具
 * API Key Management Tool
 *
 * 用于加密、解密和管理交易所API密钥
 * For encrypting, decrypting and managing exchange API keys
 *
 * 使用方法 / Usage:
 *   node scripts/keyManager.js encrypt     # 加密密钥
 *   node scripts/keyManager.js decrypt     # 解密并显示密钥
 *   node scripts/keyManager.js verify      # 验证加密文件
 *   node scripts/keyManager.js generate    # 生成主密码
 *   node scripts/keyManager.js rotate      # 轮换主密码
 */

import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import {
  encryptKeys,
  decryptKeys,
  saveEncryptedKeys,
  loadEncryptedKeys,
  hasEncryptedKeys,
  generateMasterPassword,
  validatePasswordStrength,
  encryptValue,
  ENCRYPTED_KEYS_FILE,
  MASTER_KEY_ENV,
} from '../src/utils/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI颜色 / ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * 打印彩色消息 / Print colored message
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 打印标题 / Print header
 */
function printHeader() {
  console.log();
  log('╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║           🔐 API密钥加密管理工具 / Key Manager            ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');
  console.log();
}

/**
 * 创建readline接口 / Create readline interface
 */
function createRL() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 提问并获取输入 / Ask question and get input
 */
function question(rl, prompt, hidden = false) {
  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // 隐藏输入 / Hide input
      process.stdout.write(prompt);
      let input = '';

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit();
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += char;
          process.stdout.write('*');
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(prompt, resolve);
    }
  });
}

/**
 * 从.env文件读取当前密钥 / Read current keys from .env file
 */
function readEnvKeys() {
  const envPath = path.join(ROOT_DIR, '.env');

  if (!fs.existsSync(envPath)) {
    return null;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const keys = {
    binance: {},
    okx: {},
    bybit: {},
    gate: {},
    bitget: {},
    kucoin: {},
    kraken: {},
    deribit: {},
    telegram: {},
    email: {},
  };

  // 解析.env文件 / Parse .env file
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;

    const [, key, value] = match;

    // 映射到结构化对象 / Map to structured object
    switch (key) {
      case 'BINANCE_API_KEY':
        keys.binance.apiKey = value;
        break;
      case 'BINANCE_API_SECRET':
        keys.binance.secret = value;
        break;
      case 'BINANCE_TESTNET':
        keys.binance.testnet = value === 'true';
        break;
      case 'OKX_API_KEY':
        keys.okx.apiKey = value;
        break;
      case 'OKX_API_SECRET':
        keys.okx.secret = value;
        break;
      case 'OKX_PASSPHRASE':
        keys.okx.passphrase = value;
        break;
      case 'OKX_SANDBOX':
        keys.okx.sandbox = value === 'true';
        break;
      case 'BYBIT_API_KEY':
        keys.bybit.apiKey = value;
        break;
      case 'BYBIT_API_SECRET':
        keys.bybit.secret = value;
        break;
      case 'BYBIT_TESTNET':
        keys.bybit.testnet = value === 'true';
        break;
      case 'GATE_API_KEY':
        keys.gate.apiKey = value;
        break;
      case 'GATE_API_SECRET':
        keys.gate.secret = value;
        break;
      case 'BITGET_API_KEY':
        keys.bitget.apiKey = value;
        break;
      case 'BITGET_API_SECRET':
        keys.bitget.secret = value;
        break;
      case 'BITGET_PASSPHRASE':
        keys.bitget.passphrase = value;
        break;
      case 'KUCOIN_API_KEY':
        keys.kucoin.apiKey = value;
        break;
      case 'KUCOIN_API_SECRET':
        keys.kucoin.secret = value;
        break;
      case 'KUCOIN_PASSPHRASE':
        keys.kucoin.passphrase = value;
        break;
      case 'KRAKEN_API_KEY':
        keys.kraken.apiKey = value;
        break;
      case 'KRAKEN_API_SECRET':
      case 'KRAKEN_SECRET':
        keys.kraken.secret = value;
        break;
      case 'DERIBIT_API_KEY':
        keys.deribit.apiKey = value;
        break;
      case 'DERIBIT_API_SECRET':
      case 'DERIBIT_SECRET':
        keys.deribit.secret = value;
        break;
      case 'TELEGRAM_BOT_TOKEN':
        keys.telegram.botToken = value;
        break;
      case 'TELEGRAM_CHAT_ID':
        keys.telegram.chatId = value;
        break;
      case 'SMTP_USER':
        keys.email.user = value;
        break;
      case 'SMTP_PASS':
        keys.email.pass = value;
        break;
    }
  }

  return keys;
}

/**
 * 加密命令 / Encrypt command
 */
async function cmdEncrypt() {
  const rl = createRL();

  try {
    log('📋 加密API密钥 / Encrypting API Keys', 'bold');
    console.log();

    // 读取当前.env中的密钥 / Read current keys from .env
    const existingKeys = readEnvKeys();

    if (existingKeys) {
      log('📂 检测到 .env 文件中的密钥配置', 'yellow');
      console.log();
    }

    // 选择输入方式 / Choose input method
    const useEnv = existingKeys
      ? await question(rl, '是否使用 .env 文件中的密钥? (y/n) / Use keys from .env? ')
      : 'n';

    let keys;

    if (useEnv.toLowerCase() === 'y') {
      keys = existingKeys;
      log('✓ 使用 .env 文件中的密钥', 'green');
    } else {
      // 手动输入密钥 / Manual input
      log('\n📝 请输入API密钥 (留空跳过) / Enter API keys (leave empty to skip):', 'cyan');
      console.log();

      keys = {
        binance: {
          apiKey: await question(rl, 'Binance API Key: '),
          secret: await question(rl, 'Binance Secret: ', true),
        },
        okx: {
          apiKey: await question(rl, 'OKX API Key: '),
          secret: await question(rl, 'OKX Secret: ', true),
          passphrase: await question(rl, 'OKX Passphrase: ', true),
        },
        bybit: {
          apiKey: await question(rl, 'Bybit API Key: '),
          secret: await question(rl, 'Bybit Secret: ', true),
        },
        gate: {
          apiKey: await question(rl, 'Gate API Key: '),
          secret: await question(rl, 'Gate Secret: ', true),
        },
        bitget: {
          apiKey: await question(rl, 'Bitget API Key: '),
          secret: await question(rl, 'Bitget Secret: ', true),
          passphrase: await question(rl, 'Bitget Passphrase: ', true),
        },
        kucoin: {
          apiKey: await question(rl, 'Kucoin API Key: '),
          secret: await question(rl, 'Kucoin Secret: ', true),
          passphrase: await question(rl, 'Kucoin Passphrase: ', true),
        },
        kraken: {
          apiKey: await question(rl, 'Kraken API Key: '),
          secret: await question(rl, 'Kraken Secret: ', true),
        },
        deribit: {
          apiKey: await question(rl, 'Deribit API Key: '),
          secret: await question(rl, 'Deribit Secret: ', true),
        },
      };
    }

    // 过滤空值 / Filter empty values
    for (const exchange in keys) {
      for (const key in keys[exchange]) {
        if (!keys[exchange][key]) {
          delete keys[exchange][key];
        }
      }
      if (Object.keys(keys[exchange]).length === 0) {
        delete keys[exchange];
      }
    }

    if (Object.keys(keys).length === 0) {
      log('❌ 没有提供任何密钥 / No keys provided', 'red');
      return;
    }

    console.log();
    log('🔑 设置主密码 / Set Master Password', 'cyan');
    log('  (密码用于加密/解密，请妥善保管)', 'yellow');
    log('  (Password is used for encryption/decryption, keep it safe)', 'yellow');
    console.log();

    // 输入主密码 / Input master password
    const password1 = await question(rl, '请输入主密码 / Enter master password: ', true);

    // 验证密码强度 / Validate password strength
    const strength = validatePasswordStrength(password1);
    if (!strength.valid) {
      log(`\n❌ 密码强度不足 / Password too weak: ${strength.level}`, 'red');
      strength.messages.forEach((msg) => log(`   - ${msg}`, 'yellow'));
      return;
    }

    const password2 = await question(rl, '请再次输入主密码 / Confirm password: ', true);

    if (password1 !== password2) {
      log('\n❌ 两次密码不一致 / Passwords do not match', 'red');
      return;
    }

    // 加密并保存 / Encrypt and save
    const filePath = path.join(ROOT_DIR, ENCRYPTED_KEYS_FILE);
    saveEncryptedKeys(keys, password1, filePath);

    console.log();
    log('✅ 密钥已加密保存 / Keys encrypted and saved', 'green');
    log(`📁 文件位置 / File location: ${filePath}`, 'cyan');
    console.log();

    // 生成环境变量设置提示 / Generate environment variable hint
    log('⚠️  重要提示 / Important:', 'yellow');
    log('   1. 请将主密码设置为环境变量:', 'yellow');
    log(`      export ${MASTER_KEY_ENV}="你的主密码"`, 'cyan');
    log('   2. 或在启动时通过参数传入', 'yellow');
    log('   3. 可以删除 .env 文件中的明文API密钥', 'yellow');
    console.log();

    // 询问是否生成加密的.env值 / Ask if generate encrypted .env values
    const genEnv = await question(
      rl,
      '是否生成加密后的环境变量值? (y/n) / Generate encrypted env values? '
    );

    if (genEnv.toLowerCase() === 'y') {
      console.log();
      log('📋 加密后的环境变量值 / Encrypted environment variable values:', 'cyan');
      console.log();

      for (const exchange in keys) {
        for (const key in keys[exchange]) {
          const envKey = `${exchange.toUpperCase()}_${key.toUpperCase()}`;
          const encValue = encryptValue(keys[exchange][key], password1);
          console.log(`${envKey}=${encValue}`);
        }
      }
      console.log();
    }
  } finally {
    rl.close();
  }
}

/**
 * 解密命令 / Decrypt command
 */
async function cmdDecrypt() {
  const rl = createRL();

  try {
    log('🔓 解密并显示密钥 / Decrypt and show keys', 'bold');
    console.log();

    // 检查加密文件是否存在 / Check if encrypted file exists
    if (!hasEncryptedKeys(path.join(ROOT_DIR, ENCRYPTED_KEYS_FILE))) {
      log('❌ 未找到加密密钥文件 / Encrypted keys file not found', 'red');
      log(`   请先运行: node scripts/keyManager.js encrypt`, 'yellow');
      return;
    }

    // 获取主密码 / Get master password
    let masterPassword = process.env[MASTER_KEY_ENV];

    if (!masterPassword) {
      masterPassword = await question(rl, '请输入主密码 / Enter master password: ', true);
    } else {
      log('✓ 使用环境变量中的主密码', 'green');
    }

    // 解密 / Decrypt
    try {
      const keys = loadEncryptedKeys(masterPassword, path.join(ROOT_DIR, ENCRYPTED_KEYS_FILE));

      console.log();
      log('✅ 解密成功 / Decryption successful', 'green');
      console.log();
      log('📋 API密钥内容 / API Keys:', 'cyan');
      console.log();

      // 显示密钥（部分隐藏）/ Show keys (partially hidden)
      for (const exchange in keys) {
        log(`  ${exchange.toUpperCase()}:`, 'bold');
        for (const key in keys[exchange]) {
          const value = keys[exchange][key];
          if (typeof value === 'string' && value.length > 8) {
            const masked = value.slice(0, 4) + '****' + value.slice(-4);
            console.log(`    ${key}: ${masked}`);
          } else {
            console.log(`    ${key}: ${value}`);
          }
        }
        console.log();
      }

      // 询问是否显示完整值 / Ask if show full values
      const showFull = await question(rl, '显示完整值? (y/n) / Show full values? ');
      if (showFull.toLowerCase() === 'y') {
        console.log();
        console.log(JSON.stringify(keys, null, 2));
      }
    } catch (error) {
      log(`\n❌ 解密失败 / Decryption failed: ${error.message}`, 'red');
    }
  } finally {
    rl.close();
  }
}

/**
 * 验证命令 / Verify command
 */
async function cmdVerify() {
  const rl = createRL();

  try {
    log('🔍 验证加密文件 / Verifying encrypted file', 'bold');
    console.log();

    const filePath = path.join(ROOT_DIR, ENCRYPTED_KEYS_FILE);

    // 检查文件 / Check file
    if (!hasEncryptedKeys(filePath)) {
      log('❌ 加密文件不存在 / Encrypted file does not exist', 'red');
      return;
    }

    // 文件信息 / File info
    const stats = fs.statSync(filePath);
    log('📁 文件信息 / File info:', 'cyan');
    log(`   路径 / Path: ${filePath}`, 'reset');
    log(`   大小 / Size: ${stats.size} bytes`, 'reset');
    log(`   修改时间 / Modified: ${stats.mtime.toISOString()}`, 'reset');
    console.log();

    // 验证解密 / Verify decryption
    let masterPassword = process.env[MASTER_KEY_ENV];

    if (!masterPassword) {
      masterPassword = await question(rl, '请输入主密码验证 / Enter master password to verify: ', true);
    }

    try {
      const keys = loadEncryptedKeys(masterPassword, filePath);
      const exchangeCount = Object.keys(keys).length;
      let keyCount = 0;
      for (const exchange in keys) {
        keyCount += Object.keys(keys[exchange]).length;
      }

      console.log();
      log('✅ 验证成功 / Verification successful', 'green');
      log(`   交易所数量 / Exchanges: ${exchangeCount}`, 'cyan');
      log(`   密钥数量 / Keys: ${keyCount}`, 'cyan');
    } catch (error) {
      log(`\n❌ 验证失败 / Verification failed: ${error.message}`, 'red');
    }
  } finally {
    rl.close();
  }
}

/**
 * 生成主密码命令 / Generate master password command
 */
async function cmdGenerate() {
  log('🎲 生成安全主密码 / Generating secure master password', 'bold');
  console.log();

  const password = generateMasterPassword(32);
  const strength = validatePasswordStrength(password);

  log('📋 生成的主密码 / Generated master password:', 'cyan');
  console.log();
  log(`   ${password}`, 'green');
  console.log();
  log(`   强度 / Strength: ${strength.level}`, 'cyan');
  log(`   得分 / Score: ${strength.score}/8`, 'cyan');
  console.log();
  log('⚠️  请妥善保存此密码，丢失后无法恢复加密的密钥！', 'yellow');
  log('⚠️  Keep this password safe, encrypted keys cannot be recovered if lost!', 'yellow');
}

/**
 * 轮换主密码命令 / Rotate master password command
 */
async function cmdRotate() {
  const rl = createRL();

  try {
    log('🔄 轮换主密码 / Rotating master password', 'bold');
    console.log();

    const filePath = path.join(ROOT_DIR, ENCRYPTED_KEYS_FILE);

    if (!hasEncryptedKeys(filePath)) {
      log('❌ 未找到加密密钥文件 / Encrypted keys file not found', 'red');
      return;
    }

    // 输入旧密码 / Input old password
    const oldPassword = await question(rl, '请输入当前主密码 / Enter current master password: ', true);

    // 解密 / Decrypt
    let keys;
    try {
      keys = loadEncryptedKeys(oldPassword, filePath);
    } catch {
      log('\n❌ 当前密码错误 / Current password incorrect', 'red');
      return;
    }

    log('\n✓ 当前密码验证成功 / Current password verified', 'green');
    console.log();

    // 输入新密码 / Input new password
    const newPassword1 = await question(rl, '请输入新主密码 / Enter new master password: ', true);

    const strength = validatePasswordStrength(newPassword1);
    if (!strength.valid) {
      log(`\n❌ 新密码强度不足 / New password too weak: ${strength.level}`, 'red');
      strength.messages.forEach((msg) => log(`   - ${msg}`, 'yellow'));
      return;
    }

    const newPassword2 = await question(rl, '请确认新主密码 / Confirm new master password: ', true);

    if (newPassword1 !== newPassword2) {
      log('\n❌ 两次密码不一致 / Passwords do not match', 'red');
      return;
    }

    // 备份旧文件 / Backup old file
    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    log(`\n📦 已备份旧文件 / Old file backed up: ${backupPath}`, 'cyan');

    // 使用新密码重新加密 / Re-encrypt with new password
    saveEncryptedKeys(keys, newPassword1, filePath);

    console.log();
    log('✅ 主密码轮换成功 / Master password rotated successfully', 'green');
    log('⚠️  请更新环境变量中的 MASTER_KEY', 'yellow');
  } finally {
    rl.close();
  }
}

/**
 * 显示帮助 / Show help
 */
function showHelp() {
  printHeader();

  log('使用方法 / Usage:', 'bold');
  console.log('  node scripts/keyManager.js <command>');
  console.log();

  log('可用命令 / Available commands:', 'bold');
  console.log('  encrypt   加密API密钥并保存到文件');
  console.log('            Encrypt API keys and save to file');
  console.log();
  console.log('  decrypt   解密并显示存储的密钥');
  console.log('            Decrypt and show stored keys');
  console.log();
  console.log('  verify    验证加密文件完整性');
  console.log('            Verify encrypted file integrity');
  console.log();
  console.log('  generate  生成安全的随机主密码');
  console.log('            Generate secure random master password');
  console.log();
  console.log('  rotate    轮换主密码');
  console.log('            Rotate master password');
  console.log();

  log('环境变量 / Environment variables:', 'bold');
  console.log(`  ${MASTER_KEY_ENV}  主密码，可设置避免交互输入`);
  console.log('              Master password, set to avoid interactive input');
  console.log();

  log('示例 / Examples:', 'bold');
  console.log('  # 加密密钥');
  console.log('  node scripts/keyManager.js encrypt');
  console.log();
  console.log('  # 使用环境变量解密');
  console.log(`  export ${MASTER_KEY_ENV}="your_password"`);
  console.log('  node scripts/keyManager.js decrypt');
  console.log();
}

// 主函数 / Main function
async function main() {
  const command = process.argv[2];

  printHeader();

  switch (command) {
    case 'encrypt':
      await cmdEncrypt();
      break;
    case 'decrypt':
      await cmdDecrypt();
      break;
    case 'verify':
      await cmdVerify();
      break;
    case 'generate':
      await cmdGenerate();
      break;
    case 'rotate':
      await cmdRotate();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      log(`❌ 未知命令: ${command}`, 'red');
      console.log();
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  log(`❌ 错误 / Error: ${error.message}`, 'red');
  process.exit(1);
});
