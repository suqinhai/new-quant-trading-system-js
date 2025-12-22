#!/usr/bin/env node
/**
 * 安全审计扫描工具
 * Security Audit Scanner
 *
 * 执行自动化安全检查
 * Performs automated security checks
 *
 * 使用方法 / Usage:
 *   node scripts/securityAudit.js          # 运行完整扫描
 *   node scripts/securityAudit.js --quick  # 快速扫描
 *   node scripts/securityAudit.js --fix    # 扫描并尝试修复
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// 扫描结果
const results = {
  passed: [],
  warnings: [],
  failures: [],
  info: [],
};

/**
 * 打印彩色消息
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 记录结果
 */
function record(type, check, message, details = null) {
  results[type].push({ check, message, details });

  const icons = {
    passed: '✅',
    warnings: '⚠️',
    failures: '❌',
    info: 'ℹ️',
  };

  const colorMap = {
    passed: 'green',
    warnings: 'yellow',
    failures: 'red',
    info: 'cyan',
  };

  log(`  ${icons[type]} ${check}: ${message}`, colorMap[type]);
}

/**
 * 检查敏感文件
 */
function checkSensitiveFiles() {
  log('\n📁 检查敏感文件 / Checking sensitive files...', 'bold');

  const sensitivePatterns = [
    { pattern: '.env', exclude: ['.env.example'] },
    { pattern: '.keys.enc', exclude: [] },
    { pattern: 'credentials.json', exclude: [] },
    { pattern: '*.pem', exclude: [] },
    { pattern: '*.key', exclude: [] },
    { pattern: 'id_rsa', exclude: [] },
  ];

  // 检查 .gitignore
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    for (const { pattern } of sensitivePatterns) {
      if (gitignore.includes(pattern) || gitignore.includes(pattern.replace('*', ''))) {
        record('passed', 'Gitignore', `${pattern} 已在 .gitignore 中排除`);
      } else {
        record('warnings', 'Gitignore', `${pattern} 未在 .gitignore 中排除`);
      }
    }
  } else {
    record('failures', 'Gitignore', '.gitignore 文件不存在');
  }

  // 检查 .env 文件是否包含真实密钥
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');

    // 检查是否有疑似真实密钥的值
    const suspiciousPatterns = [
      { name: 'API Key', pattern: /(?:api_?key|apikey)\s*=\s*[a-zA-Z0-9]{32,}/i },
      { name: 'Secret', pattern: /(?:secret|password|pass)\s*=\s*[a-zA-Z0-9!@#$%^&*]{12,}/i },
      { name: 'Token', pattern: /(?:token|bot_token)\s*=\s*\d+:[a-zA-Z0-9_-]{30,}/i },
      { name: 'JWT', pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ },
    ];

    let foundSuspicious = false;
    for (const { name, pattern } of suspiciousPatterns) {
      if (pattern.test(envContent)) {
        record('failures', 'Env File', `发现疑似真实 ${name}，请使用占位符或加密存储`);
        foundSuspicious = true;
      }
    }

    if (!foundSuspicious) {
      record('passed', 'Env File', '.env 文件未发现明文敏感数据');
    }
  }
}

/**
 * 检查依赖安全
 */
async function checkDependencies() {
  log('\n📦 检查依赖安全 / Checking dependency security...', 'bold');

  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    record('warnings', 'Dependencies', 'package.json 不存在');
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // 检查已知不安全的包
  const knownVulnerable = [
    'event-stream', // 已知恶意包
    'flatmap-stream', // 已知恶意包
    'lodash', // 低版本有原型污染漏洞
  ];

  for (const pkg of knownVulnerable) {
    if (deps[pkg]) {
      record('warnings', 'Vulnerable Pkg', `${pkg} 可能存在安全风险，请检查版本`);
    }
  }

  // 检查是否有 npm audit
  record('info', 'Dependencies', `共 ${Object.keys(deps).length} 个依赖，建议运行 npm audit`);
}

/**
 * 检查代码安全模式
 */
function checkCodePatterns() {
  log('\n🔍 检查代码安全模式 / Checking code security patterns...', 'bold');

  const jsFiles = findFiles(path.join(ROOT_DIR, 'src'), '.js');

  const dangerousPatterns = [
    { name: 'eval()', pattern: /eval\s*\(/, severity: 'failure' },
    { name: 'Function()', pattern: /new\s+Function\s*\(/, severity: 'failure' },
    { name: 'innerHTML', pattern: /\.innerHTML\s*=/, severity: 'warning' },
    { name: 'exec()', pattern: /child_process.*exec\s*\(/, severity: 'warning' },
    { name: 'SQL injection risk', pattern: /query\s*\(\s*[`'"]\s*SELECT.*\+/, severity: 'warning' },
    { name: 'Hardcoded password', pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/, severity: 'failure' },
    { name: 'Hardcoded API key', pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/, severity: 'failure' },
  ];

  let issueCount = 0;

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(ROOT_DIR, file);

    for (const { name, pattern, severity } of dangerousPatterns) {
      if (pattern.test(content)) {
        const type = severity === 'failure' ? 'failures' : 'warnings';
        record(type, 'Code Pattern', `${name} 在 ${relativePath}`);
        issueCount++;
      }
    }
  }

  if (issueCount === 0) {
    record('passed', 'Code Pattern', '未发现危险代码模式');
  }
}

/**
 * 检查加密配置
 */
function checkEncryption() {
  log('\n🔐 检查加密配置 / Checking encryption configuration...', 'bold');

  // 检查是否使用加密存储
  const keysEncPath = path.join(ROOT_DIR, '.keys.enc');
  if (fs.existsSync(keysEncPath)) {
    record('passed', 'Key Storage', '使用加密密钥存储');
  } else {
    record('info', 'Key Storage', '未使用加密密钥存储，建议运行 node scripts/keyManager.js encrypt');
  }

  // 检查加密模块
  const cryptoPath = path.join(ROOT_DIR, 'src/utils/crypto.js');
  if (fs.existsSync(cryptoPath)) {
    const content = fs.readFileSync(cryptoPath, 'utf8');

    if (content.includes('aes-256-gcm')) {
      record('passed', 'Encryption', '使用 AES-256-GCM 加密算法');
    }

    if (content.includes('pbkdf2')) {
      record('passed', 'Key Derivation', '使用 PBKDF2 密钥派生');
    }

    // 检查迭代次数
    const iterMatch = content.match(/PBKDF2_ITERATIONS\s*=\s*(\d+)/);
    if (iterMatch) {
      const iterations = parseInt(iterMatch[1], 10);
      if (iterations >= 100000) {
        record('passed', 'PBKDF2 Iterations', `使用 ${iterations} 次迭代`);
      } else {
        record('warnings', 'PBKDF2 Iterations', `迭代次数 ${iterations} 偏低，建议至少 100000`);
      }
    }
  }
}

/**
 * 检查认证配置
 */
function checkAuthentication() {
  log('\n🔑 检查认证配置 / Checking authentication configuration...', 'bold');

  // 检查认证中间件
  const authPath = path.join(ROOT_DIR, 'src/middleware/auth.js');
  if (fs.existsSync(authPath)) {
    const content = fs.readFileSync(authPath, 'utf8');

    if (content.includes('JWT')) {
      record('passed', 'Authentication', '使用 JWT 认证');
    }

    if (content.includes('timingSafeEqual')) {
      record('passed', 'Timing Attack', '使用时间安全比较防止时序攻击');
    }

    if (content.includes('lockout') || content.includes('maxLoginAttempts')) {
      record('passed', 'Brute Force', '实现登录失败锁定机制');
    }
  } else {
    record('info', 'Authentication', '未找到认证模块');
  }

  // 检查安全中间件
  const securityPath = path.join(ROOT_DIR, 'src/middleware/security.js');
  if (fs.existsSync(securityPath)) {
    const content = fs.readFileSync(securityPath, 'utf8');

    if (content.includes('RateLimiter')) {
      record('passed', 'Rate Limiting', '实现速率限制');
    }

    if (content.includes('verifySignature')) {
      record('passed', 'Request Signing', '实现请求签名验证');
    }

    if (content.includes('enableNonceCheck') || content.includes('usedNonces')) {
      record('passed', 'Replay Attack', '实现 Nonce 防重放攻击');
    }
  }
}

/**
 * 检查日志安全
 */
function checkLogging() {
  log('\n📝 检查日志安全 / Checking logging security...', 'bold');

  const loggerPath = path.join(ROOT_DIR, 'src/logging/Logger.js');
  if (fs.existsSync(loggerPath)) {
    const content = fs.readFileSync(loggerPath, 'utf8');

    if (content.includes('sensitiveFields') || content.includes('REDACTED')) {
      record('passed', 'Log Sanitization', '日志实现敏感字段脱敏');
    } else {
      record('warnings', 'Log Sanitization', '日志未实现敏感字段脱敏');
    }
  }

  // 检查审计日志
  const auditPath = path.join(ROOT_DIR, 'src/logger/AuditLogger.js');
  if (fs.existsSync(auditPath)) {
    const content = fs.readFileSync(auditPath, 'utf8');

    if (content.includes('enableIntegrity') || content.includes('computeHash')) {
      record('passed', 'Audit Integrity', '审计日志实现完整性保护');
    }
  }
}

/**
 * 检查网络安全
 */
function checkNetworkSecurity() {
  log('\n🌐 检查网络安全 / Checking network security...', 'bold');

  // 检查 HTTPS 使用
  const jsFiles = findFiles(path.join(ROOT_DIR, 'src'), '.js');
  let httpUsage = 0;

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(content)) {
      httpUsage++;
    }
  }

  if (httpUsage === 0) {
    record('passed', 'HTTPS', '未发现非本地 HTTP 连接');
  } else {
    record('warnings', 'HTTPS', `发现 ${httpUsage} 处可能的非安全 HTTP 连接`);
  }

  // 检查 CORS 配置
  const serverFiles = findFiles(ROOT_DIR, '.js').filter(f => f.includes('server'));
  for (const file of serverFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes("cors({ origin: '*'")) {
      record('warnings', 'CORS', `${path.basename(file)} 使用通配符 CORS，生产环境应限制`);
    }
  }
}

/**
 * 生成报告
 */
function generateReport() {
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 安全审计报告 / Security Audit Report', 'bold');
  log('='.repeat(60), 'cyan');

  const total = results.passed.length + results.warnings.length + results.failures.length;
  const score = total > 0 ? Math.round((results.passed.length / total) * 100) : 0;

  log(`\n📈 安全评分 / Security Score: ${score}%`, score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red');

  log(`\n✅ 通过 / Passed: ${results.passed.length}`, 'green');
  log(`⚠️  警告 / Warnings: ${results.warnings.length}`, 'yellow');
  log(`❌ 失败 / Failures: ${results.failures.length}`, 'red');
  log(`ℹ️  信息 / Info: ${results.info.length}`, 'cyan');

  if (results.failures.length > 0) {
    log('\n❌ 需要立即修复的问题 / Critical Issues:', 'red');
    for (const item of results.failures) {
      log(`   - [${item.check}] ${item.message}`, 'red');
    }
  }

  if (results.warnings.length > 0) {
    log('\n⚠️  建议修复的问题 / Recommended Fixes:', 'yellow');
    for (const item of results.warnings) {
      log(`   - [${item.check}] ${item.message}`, 'yellow');
    }
  }

  log('\n' + '='.repeat(60), 'cyan');

  // 返回退出码
  return results.failures.length > 0 ? 1 : 0;
}

/**
 * 递归查找文件
 */
function findFiles(dir, ext) {
  const files = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) {
        files.push(...findFiles(fullPath, ext));
      }
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const quickMode = args.includes('--quick');

  log('\n🔒 量化交易系统安全审计 / Security Audit', 'bold');
  log('='.repeat(60), 'cyan');
  log(`📅 扫描时间 / Scan Time: ${new Date().toISOString()}`, 'cyan');
  log(`📁 扫描目录 / Scan Directory: ${ROOT_DIR}`, 'cyan');
  log(`⚡ 模式 / Mode: ${quickMode ? '快速扫描' : '完整扫描'}`, 'cyan');

  // 执行检查
  checkSensitiveFiles();

  if (!quickMode) {
    await checkDependencies();
  }

  checkCodePatterns();
  checkEncryption();
  checkAuthentication();
  checkLogging();
  checkNetworkSecurity();

  // 生成报告
  const exitCode = generateReport();

  process.exit(exitCode);
}

main().catch(error => {
  console.error('扫描失败 / Scan failed:', error.message);
  process.exit(1);
});
