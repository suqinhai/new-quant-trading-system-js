#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const placeholderMatchers = [
  /your_/i,
  /replace_/i,
  /placeholder/i,
  /^changeme$/i,
  /^admin123$/i,
  /^your-secret-key$/i,
  /^your_secure_password_here$/i,
];

function colorize(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function parseArgs(argv) {
  let file = '.env';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      file = argv[i + 1];
      i++;
    }
  }

  return {
    file,
  };
}

function hasPlaceholder(value) {
  if (!value) {
    return true;
  }

  return placeholderMatchers.some((matcher) => matcher.test(String(value).trim()));
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function safeReadEnv(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  return dotenv.parse(content);
}

function listTrackedSensitiveFiles() {
  const result = spawnSync('git', ['ls-files', '.env', '.keys.enc'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findConfiguredExchange(env) {
  const candidates = [
    ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
    ['OKX_API_KEY', 'OKX_API_SECRET'],
    ['BYBIT_API_KEY', 'BYBIT_API_SECRET'],
    ['GATE_API_KEY', 'GATE_API_SECRET'],
  ];

  return candidates.some(([keyField, secretField]) => (
    env[keyField]
    && env[secretField]
    && !hasPlaceholder(env[keyField])
    && !hasPlaceholder(env[secretField])
  ));
}

function main() {
  const { file } = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(ROOT_DIR, file);

  if (!fs.existsSync(envPath)) {
    console.error(colorize('red', `Missing env file: ${envPath}`));
    process.exit(1);
  }

  const env = safeReadEnv(envPath);
  const failures = [];
  const warnings = [];

  const required = [
    'JWT_SECRET',
    'DASHBOARD_PASSWORD',
    'HTTP_PORT',
    'RUN_MODE',
    'ENABLE_API',
    'REDIS_HOST',
    'REDIS_PORT',
  ];

  for (const field of required) {
    if (!env[field] || hasPlaceholder(env[field])) {
      failures.push(`${field} is missing or still a placeholder`);
    }
  }

  if (env.ENABLE_API && !isTruthy(env.ENABLE_API)) {
    failures.push('ENABLE_API must stay enabled for staging deployment');
  }

  if (env.ALLOW_INSECURE_DEFAULT_AUTH && isTruthy(env.ALLOW_INSECURE_DEFAULT_AUTH)) {
    failures.push('ALLOW_INSECURE_DEFAULT_AUTH must be false in staging');
  }

  if (env.JWT_SECRET && String(env.JWT_SECRET).length < 32) {
    failures.push('JWT_SECRET should be at least 32 characters');
  }

  if (env.DASHBOARD_PASSWORD && String(env.DASHBOARD_PASSWORD).length < 12) {
    warnings.push('DASHBOARD_PASSWORD is shorter than 12 characters');
  }

  if (fs.existsSync(path.join(ROOT_DIR, '.keys.enc')) && (!env.MASTER_KEY || hasPlaceholder(env.MASTER_KEY))) {
    failures.push('MASTER_KEY is required because .keys.enc exists');
  }

  if (!findConfiguredExchange(env)) {
    warnings.push('No fully configured exchange credential pair found');
  }

  if (!env.TELEGRAM_BOT_TOKEN && !env.SMTP_HOST) {
    warnings.push('No alert channel configured (Telegram or SMTP)');
  }

  const trackedSensitive = listTrackedSensitiveFiles();
  for (const tracked of trackedSensitive) {
    failures.push(`${tracked} is still tracked by git`);
  }

  console.log(colorize('blue', `Checking staging env: ${path.relative(ROOT_DIR, envPath)}`));

  if (failures.length === 0 && warnings.length === 0) {
    console.log(colorize('green', 'Staging env check passed'));
    return;
  }

  for (const failure of failures) {
    console.log(colorize('red', `FAIL: ${failure}`));
  }

  for (const warning of warnings) {
    console.log(colorize('yellow', `WARN: ${warning}`));
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
