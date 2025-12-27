#!/usr/bin/env node
/**
 * OKX 连接测试脚本
 * OKX Connection Test Script
 *
 * 用于诊断 OKX 连接问题
 * Used to diagnose OKX connection issues
 */

import 'dotenv/config';
import ccxt from 'ccxt';

async function testOKXConnection() {
  console.log('='.repeat(60));
  console.log('OKX Connection Test');
  console.log('='.repeat(60));

  // 获取环境变量 / Get environment variables
  const apiKey = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const password = process.env.OKX_PASSPHRASE || process.env.OKX_PASSWORD;
  const sandboxEnv = process.env.OKX_SANDBOX;

  console.log('\n[Configuration]');
  console.log(`  API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`  Secret: ${secret ? secret.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`  Password: ${password ? '***SET***' : 'NOT SET'}`);
  console.log(`  OKX_SANDBOX env: ${sandboxEnv}`);
  console.log(`  CCXT Version: ${ccxt.version}`);

  if (!apiKey || !secret || !password) {
    console.error('\n[ERROR] Missing required credentials');
    return;
  }

  // 测试两种模式 / Test both modes
  const modes = [
    { name: 'Production (sandbox=false)', sandbox: false },
    { name: 'Demo/Sandbox (sandbox=true)', sandbox: true },
  ];

  for (const mode of modes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${mode.name}`);
    console.log('='.repeat(60));

    try {
      // 创建 OKX 实例 / Create OKX instance
      const okx = new ccxt.okx({
        apiKey,
        secret,
        password,
        enableRateLimit: true,
        timeout: 30000,
        options: {
          defaultType: 'swap',
        },
      });

      // 设置沙盒模式 / Set sandbox mode
      if (mode.sandbox) {
        okx.setSandboxMode(true);
        console.log('[INFO] Sandbox mode enabled');
      }

      console.log('\n[Step 1] Loading markets...');
      const startTime = Date.now();
      const markets = await okx.loadMarkets();
      console.log(`[OK] Loaded ${Object.keys(markets).length} markets in ${Date.now() - startTime}ms`);

      console.log('\n[Step 2] Fetching balance...');
      const balance = await okx.fetchBalance();
      const nonZeroBalances = Object.entries(balance.total || {})
        .filter(([_, val]) => val > 0)
        .map(([coin, val]) => `${coin}: ${val}`);

      console.log('[OK] Balance fetched successfully');
      if (nonZeroBalances.length > 0) {
        console.log(`[INFO] Non-zero balances: ${nonZeroBalances.join(', ')}`);
      } else {
        console.log('[INFO] No non-zero balances');
      }

      console.log('\n[Step 3] Fetching BTC/USDT ticker...');
      const ticker = await okx.fetchTicker('BTC/USDT:USDT');
      console.log(`[OK] BTC/USDT price: ${ticker.last}`);

      console.log('\n[Step 4] Fetching funding rate...');
      try {
        const fundingRate = await okx.fetchFundingRate('BTC/USDT:USDT');
        console.log(`[OK] Funding rate: ${(fundingRate.fundingRate * 100).toFixed(4)}%`);
      } catch (e) {
        console.log(`[SKIP] Funding rate: ${e.message}`);
      }

      console.log(`\n[SUCCESS] ${mode.name} connection works!`);
      console.log('[RECOMMENDATION] Use this configuration for OKX');

      // 连接成功，直接返回 / Connection successful, return
      return { success: true, mode };

    } catch (error) {
      console.log(`\n[FAILED] ${mode.name}`);
      console.log(`  Error Type: ${error.constructor.name}`);
      console.log(`  Message: ${error.message}`);

      // 打印更多错误详情 / Print more error details
      if (error.message.includes('substring')) {
        console.log('\n[DEBUG] This appears to be a CCXT parsing error.');
        console.log('  This usually means the API response was unexpected.');
        console.log('  Possible causes:');
        console.log('  1. API key is for a different environment (demo vs production)');
        console.log('  2. API key permissions are insufficient');
        console.log('  3. CCXT version incompatibility');
      }

      if (error.message.includes('Invalid')) {
        console.log('\n[DEBUG] Authentication or permission issue detected.');
      }
    }
  }

  console.log('\n[RESULT] Neither mode worked. Please check:');
  console.log('  1. API credentials are correct');
  console.log('  2. API was created in the right environment (demo vs production)');
  console.log('  3. API has correct permissions (trade, read, etc.)');
}

// 运行测试 / Run test
testOKXConnection()
  .then(() => {
    console.log('\n[Done] Test completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n[Fatal Error]', err);
    process.exit(1);
  });
