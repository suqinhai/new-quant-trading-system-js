#!/usr/bin/env node
/**
 * Binance 连接测试脚本
 * Binance Connection Test Script
 */

import 'dotenv/config';
import ccxt from 'ccxt';

async function testBinanceConnection() {
  console.log('='.repeat(60));
  console.log('Binance Connection Test');
  console.log('='.repeat(60));

  const apiKey = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  const testnet = process.env.BINANCE_TESTNET === 'true';

  console.log('\n[Configuration]');
  console.log(`  API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`  Secret: ${secret ? secret.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`  Testnet: ${testnet}`);
  console.log(`  CCXT Version: ${ccxt.version}`);

  if (!apiKey || !secret) {
    console.error('\n[ERROR] Missing required credentials');
    return;
  }

  try {
    // 创建 Binance Futures 实例
    const binance = new ccxt.binance({
      apiKey,
      secret,
      enableRateLimit: true,
      timeout: 30000,
      options: {
        defaultType: 'swap',
      },
    });

    console.log('\n[Step 1] Loading markets...');
    const startTime = Date.now();
    const markets = await binance.loadMarkets();
    console.log(`[OK] Loaded ${Object.keys(markets).length} markets in ${Date.now() - startTime}ms`);

    console.log('\n[Step 2] Fetching balance...');
    const balance = await binance.fetchBalance();
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
    const ticker = await binance.fetchTicker('BTC/USDT:USDT');
    console.log(`[OK] BTC/USDT price: ${ticker.last}`);

    console.log('\n[SUCCESS] Binance connection works!');

  } catch (error) {
    console.log('\n[FAILED]');
    console.log(`  Error Type: ${error.constructor.name}`);
    console.log(`  Message: ${error.message}`);

    if (error.message.includes('-2015')) {
      console.log('\n[DEBUG] This is an API key/IP restriction error.');
      console.log('  Possible causes:');
      console.log('  1. API key is invalid or expired');
      console.log('  2. Your current IP is not whitelisted');
      console.log('  3. API key lacks required permissions (Futures)');
      console.log('  4. API key is for Spot only, not Futures');
    }
  }
}

testBinanceConnection()
  .then(() => {
    console.log('\n[Done] Test completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n[Fatal Error]', err);
    process.exit(1);
  });
