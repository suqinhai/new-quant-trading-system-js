/**
 * MarketDataEngine 行情数据引擎测试
 * Market Data Engine Tests
 *
 * 注意：这些测试主要测试引擎的内部逻辑，不需要真实的 WebSocket 和 Redis 连接
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketDataEngine, DATA_TYPES, REDIS_KEYS } from '../../src/marketdata/MarketDataEngine.js';

describe('MarketDataEngine', () => {
  let engine;
  const defaultConfig = {
    exchanges: ['binance', 'bybit', 'okx'],
    tradingType: 'futures',
    redis: {
      host: 'localhost',
      port: 6379,
    },
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
    },
    heartbeat: {
      enabled: true,
      interval: 5000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new MarketDataEngine(defaultConfig);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('构造函数', () => {
    it('应该正确初始化引擎', () => {
      expect(engine).toBeInstanceOf(MarketDataEngine);
      expect(engine.running).toBe(false);
      expect(engine.initialized).toBe(false);
    });

    it('应该使用默认配置', () => {
      const defaultEngine = new MarketDataEngine({});
      expect(defaultEngine.config.exchanges).toEqual(['binance', 'bybit', 'okx']);
      expect(defaultEngine.config.tradingType).toBe('futures');
    });

    it('应该合并自定义配置', () => {
      const customEngine = new MarketDataEngine({
        exchanges: ['binance'],
        tradingType: 'spot',
      });
      expect(customEngine.config.exchanges).toEqual(['binance']);
      expect(customEngine.config.tradingType).toBe('spot');
    });

    it('应该初始化内部状态', () => {
      expect(engine.connections).toBeInstanceOf(Map);
      expect(engine.connectionStatus).toBeInstanceOf(Map);
      expect(engine.subscriptions).toBeInstanceOf(Map);
      expect(engine.cache.tickers).toBeInstanceOf(Map);
      expect(engine.cache.depths).toBeInstanceOf(Map);
      expect(engine.cache.fundingRates).toBeInstanceOf(Map);
      expect(engine.cache.klines).toBeInstanceOf(Map);
    });

    it('应该为每个交易所初始化状态', () => {
      expect(engine.connectionStatus.has('binance')).toBe(true);
      expect(engine.connectionStatus.has('bybit')).toBe(true);
      expect(engine.connectionStatus.has('okx')).toBe(true);

      const binanceStatus = engine.connectionStatus.get('binance');
      expect(binanceStatus.connected).toBe(false);
      expect(binanceStatus.reconnecting).toBe(false);
      expect(binanceStatus.attempt).toBe(0);
    });

    it('应该初始化统计信息', () => {
      expect(engine.stats.messagesReceived).toBe(0);
      expect(engine.stats.messagesPublished).toBe(0);
      expect(engine.stats.errors).toBe(0);
      expect(engine.stats.reconnections).toBe(0);
      expect(engine.stats.startTime).toBeNull();
    });

    it('应该为每个交易所初始化订阅集合', () => {
      expect(engine.subscriptions.get('binance')).toBeInstanceOf(Set);
      expect(engine.subscriptions.get('bybit')).toBeInstanceOf(Set);
      expect(engine.subscriptions.get('okx')).toBeInstanceOf(Set);
    });

    it('应该初始化时间同步数据', () => {
      expect(engine.timeSync.has('binance')).toBe(true);
      const sync = engine.timeSync.get('binance');
      expect(sync.offset).toBe(0);
      expect(sync.lastSync).toBe(0);
    });
  });

  describe('缓存数据获取', () => {
    it('应该获取缓存的 ticker', () => {
      engine.cache.tickers.set('binance:BTC/USDT', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        last: 50000,
      });

      const ticker = engine.getTicker('BTC/USDT', 'binance');
      expect(ticker).toBeDefined();
      expect(ticker.last).toBe(50000);
    });

    it('应该返回 null 如果没有缓存数据', () => {
      const ticker = engine.getTicker('UNKNOWN/PAIR');
      expect(ticker).toBeNull();
    });

    it('应该获取缓存的深度数据', () => {
      engine.cache.depths.set('binance:BTC/USDT', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [[50000, 1]],
        asks: [[50010, 1]],
      });

      const depth = engine.getDepth('BTC/USDT', 'binance');
      expect(depth).toBeDefined();
      expect(depth.bids.length).toBe(1);
    });

    it('应该获取缓存的资金费率', () => {
      engine.cache.fundingRates.set('binance:BTC/USDT', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        fundingRate: 0.0001,
      });

      const fundingRate = engine.getFundingRate('BTC/USDT', 'binance');
      expect(fundingRate).toBeDefined();
      expect(fundingRate.fundingRate).toBe(0.0001);
    });

    it('应该支持不指定交易所获取缓存', () => {
      engine.cache.tickers.set('BTC/USDT', {
        symbol: 'BTC/USDT',
        last: 50000,
      });

      const ticker = engine.getTicker('BTC/USDT');
      expect(ticker).toBeDefined();
    });
  });

  describe('连接状态', () => {
    it('应该获取所有交易所连接状态', () => {
      const status = engine.getConnectionStatus();

      expect(status).toHaveProperty('binance');
      expect(status).toHaveProperty('bybit');
      expect(status).toHaveProperty('okx');

      expect(status.binance.connected).toBe(false);
      expect(status.binance.reconnecting).toBe(false);
    });

    it('应该获取统计信息', () => {
      const stats = engine.getStats();

      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesPublished');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('reconnections');
      expect(stats).toHaveProperty('uptimeSeconds');
      expect(stats).toHaveProperty('subscriptions');
      expect(stats.uptimeSeconds).toBe(0);
    });

    it('应该返回每个交易所的订阅数量', () => {
      // 添加一些订阅
      engine.subscriptions.get('binance').add('ticker:BTC/USDT');
      engine.subscriptions.get('binance').add('depth:BTC/USDT');
      engine.subscriptions.get('bybit').add('ticker:ETH/USDT');

      const stats = engine.getStats();
      expect(stats.subscriptions.binance).toBe(2);
      expect(stats.subscriptions.bybit).toBe(1);
    });
  });

  describe('WebSocket URL 获取', () => {
    it('应该获取 Binance futures URL', () => {
      engine.config.tradingType = 'futures';
      const url = engine._getWsUrl('binance');
      expect(url).toBe('wss://fstream.binance.com/ws');
    });

    it('应该获取 Binance spot URL', () => {
      engine.config.tradingType = 'spot';
      const url = engine._getWsUrl('binance');
      expect(url).toBe('wss://stream.binance.com:9443/ws');
    });

    it('应该获取 Bybit linear URL', () => {
      engine.config.tradingType = 'futures';
      const url = engine._getWsUrl('bybit');
      expect(url).toBe('wss://stream.bybit.com/v5/public/linear');
    });

    it('应该获取 Bybit spot URL', () => {
      engine.config.tradingType = 'spot';
      const url = engine._getWsUrl('bybit');
      expect(url).toBe('wss://stream.bybit.com/v5/public/spot');
    });

    it('应该获取 OKX public URL', () => {
      const url = engine._getWsUrl('okx');
      expect(url).toBe('wss://ws.okx.com:8443/ws/v5/public');
    });

    it('应该拒绝不支持的交易所', () => {
      expect(() => engine._getWsUrl('unknown')).toThrow('不支持的交易所');
    });
  });

  describe('订阅消息构建 - Binance', () => {
    it('应该构建 ticker 订阅消息', () => {
      const msg = engine._buildBinanceSubscribeMessage('BTC/USDT', 'ticker');
      expect(msg.method).toBe('SUBSCRIBE');
      expect(msg.params).toContain('btcusdt@ticker');
      expect(msg.id).toBeDefined();
    });

    it('应该构建 depth 订阅消息', () => {
      const msg = engine._buildBinanceSubscribeMessage('BTC/USDT', 'depth');
      expect(msg.params[0]).toContain('btcusdt@depth');
    });

    it('应该构建 trade 订阅消息', () => {
      const msg = engine._buildBinanceSubscribeMessage('BTC/USDT', 'trade');
      expect(msg.params).toContain('btcusdt@trade');
    });

    it('应该构建 fundingRate 订阅消息', () => {
      const msg = engine._buildBinanceSubscribeMessage('BTC/USDT', 'fundingRate');
      expect(msg.params[0]).toContain('btcusdt@markPrice');
    });

    it('应该构建 kline 订阅消息', () => {
      const msg = engine._buildBinanceSubscribeMessage('BTC/USDT', 'kline');
      expect(msg.params[0]).toContain('btcusdt@kline');
    });

    it('应该拒绝不支持的数据类型', () => {
      expect(() => engine._buildBinanceSubscribeMessage('BTC/USDT', 'invalid')).toThrow();
    });
  });

  describe('订阅消息构建 - Bybit', () => {
    it('应该构建 ticker 订阅消息', () => {
      const msg = engine._buildBybitSubscribeMessage('BTC/USDT', 'ticker');
      expect(msg.op).toBe('subscribe');
      expect(msg.args).toContain('tickers.BTCUSDT');
    });

    it('应该构建 depth 订阅消息', () => {
      const msg = engine._buildBybitSubscribeMessage('BTC/USDT', 'depth');
      expect(msg.args[0]).toContain('orderbook.');
    });

    it('应该构建 trade 订阅消息', () => {
      const msg = engine._buildBybitSubscribeMessage('BTC/USDT', 'trade');
      expect(msg.args[0]).toContain('publicTrade.');
    });

    it('应该构建 kline 订阅消息', () => {
      const msg = engine._buildBybitSubscribeMessage('BTC/USDT', 'kline');
      expect(msg.args[0]).toContain('kline.');
    });
  });

  describe('订阅消息构建 - OKX', () => {
    it('应该构建永续合约 ticker 订阅消息', () => {
      engine.config.tradingType = 'futures';
      const msg = engine._buildOKXSubscribeMessage('BTC/USDT', 'ticker');
      expect(msg.op).toBe('subscribe');
      expect(msg.args[0].channel).toBe('tickers');
      expect(msg.args[0].instId).toBe('BTC-USDT-SWAP');
    });

    it('应该构建现货 ticker 订阅消息', () => {
      engine.config.tradingType = 'spot';
      const msg = engine._buildOKXSubscribeMessage('BTC/USDT', 'ticker');
      expect(msg.args[0].instId).toBe('BTC-USDT');
    });

    it('应该构建 depth 订阅消息', () => {
      const msg = engine._buildOKXSubscribeMessage('BTC/USDT', 'depth');
      expect(msg.args[0].channel).toBe('books5');
    });

    it('应该构建 fundingRate 订阅消息', () => {
      const msg = engine._buildOKXSubscribeMessage('BTC/USDT', 'fundingRate');
      expect(msg.args[0].channel).toBe('funding-rate');
    });

    it('应该构建 kline 订阅消息', () => {
      const msg = engine._buildOKXSubscribeMessage('BTC/USDT', 'kline');
      expect(msg.args[0].channel).toBe('candle1H');
    });
  });

  describe('取消订阅消息构建', () => {
    it('应该构建 Binance 取消订阅消息', () => {
      const msg = engine._buildUnsubscribeMessage('binance', 'BTC/USDT', 'ticker');
      expect(msg.method).toBe('UNSUBSCRIBE');
    });

    it('应该构建 Bybit 取消订阅消息', () => {
      const msg = engine._buildUnsubscribeMessage('bybit', 'BTC/USDT', 'ticker');
      expect(msg.op).toBe('unsubscribe');
    });

    it('应该构建 OKX 取消订阅消息', () => {
      const msg = engine._buildUnsubscribeMessage('okx', 'BTC/USDT', 'ticker');
      expect(msg.op).toBe('unsubscribe');
    });
  });

  describe('交易对格式转换', () => {
    describe('Binance 转换', () => {
      it('应该转换 USDT 交易对', () => {
        expect(engine._binanceToStandardSymbol('BTCUSDT')).toBe('BTC/USDT');
      });

      it('应该转换 BTC 交易对', () => {
        expect(engine._binanceToStandardSymbol('ETHBTC')).toBe('ETH/BTC');
      });

      it('应该转换 BUSD 交易对', () => {
        expect(engine._binanceToStandardSymbol('BNBBUSD')).toBe('BNB/BUSD');
      });

      it('应该返回未知格式原样', () => {
        expect(engine._binanceToStandardSymbol('UNKNOWN')).toBe('UNKNOWN');
      });
    });

    describe('Bybit 转换', () => {
      it('应该转换 USDT 交易对', () => {
        expect(engine._bybitToStandardSymbol('BTCUSDT')).toBe('BTC/USDT');
      });

      it('应该转换 USDC 交易对', () => {
        expect(engine._bybitToStandardSymbol('ETHUSDC')).toBe('ETH/USDC');
      });
    });

    describe('OKX 转换', () => {
      it('应该转换现货交易对', () => {
        expect(engine._okxToStandardSymbol('BTC-USDT')).toBe('BTC/USDT');
      });

      it('应该转换永续合约交易对', () => {
        expect(engine._okxToStandardSymbol('BTC-USDT-SWAP')).toBe('BTC/USDT');
      });

      it('应该转换期货交易对', () => {
        expect(engine._okxToStandardSymbol('ETH-USDT-FUTURES')).toBe('ETH/USDT');
      });
    });
  });

  describe('时间戳处理', () => {
    it('应该计算统一时间戳', () => {
      const exchangeTimestamp = Date.now() - 100;
      const unified = engine._calculateUnifiedTimestamp('binance', exchangeTimestamp);

      expect(unified).toBeGreaterThan(exchangeTimestamp);
      expect(unified).toBeLessThanOrEqual(Date.now());
    });

    it('应该处理无效的交易所时间戳 (null)', () => {
      const unified = engine._calculateUnifiedTimestamp('binance', null);
      expect(unified).toBeLessThanOrEqual(Date.now());
    });

    it('应该处理 NaN 时间戳', () => {
      const unified = engine._calculateUnifiedTimestamp('binance', NaN);
      expect(unified).toBeLessThanOrEqual(Date.now());
    });

    it('应该处理 undefined 时间戳', () => {
      const unified = engine._calculateUnifiedTimestamp('binance', undefined);
      expect(unified).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('数据标准化 - Binance', () => {
    it('应该标准化 ticker', () => {
      const rawData = {
        e: '24hrTicker',
        s: 'BTCUSDT',
        c: '50000.00',
        b: '49990.00',
        B: '1.5',
        a: '50010.00',
        A: '2.0',
        o: '49000.00',
        h: '51000.00',
        l: '48000.00',
        v: '10000',
        q: '500000000',
        p: '1000',
        P: '2.04',
        E: Date.now(),
      };

      const ticker = engine._normalizeBinanceTicker(rawData);

      expect(ticker.exchange).toBe('binance');
      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.last).toBe(50000);
      expect(ticker.bid).toBe(49990);
      expect(ticker.ask).toBe(50010);
      expect(ticker.volume).toBe(10000);
      expect(ticker.change).toBe(1000);
      expect(ticker.changePercent).toBe(2.04);
    });

    it('应该标准化深度数据', () => {
      const rawData = {
        s: 'BTCUSDT',
        b: [['50000', '1.0'], ['49990', '2.0']],
        a: [['50010', '1.5'], ['50020', '0.5']],
        E: Date.now(),
      };

      const depth = engine._normalizeBinanceDepth(rawData);

      expect(depth.exchange).toBe('binance');
      expect(depth.symbol).toBe('BTC/USDT');
      expect(depth.bids).toHaveLength(2);
      expect(depth.asks).toHaveLength(2);
      expect(depth.bids[0]).toEqual([50000, 1.0]);
      expect(depth.asks[0]).toEqual([50010, 1.5]);
    });

    it('应该标准化成交数据', () => {
      const rawData = {
        s: 'BTCUSDT',
        t: 123456789,
        p: '50000.00',
        q: '0.1',
        m: true,
        T: Date.now(),
      };

      const trade = engine._normalizeBinanceTrade(rawData);

      expect(trade.exchange).toBe('binance');
      expect(trade.symbol).toBe('BTC/USDT');
      expect(trade.price).toBe(50000);
      expect(trade.amount).toBe(0.1);
      expect(trade.side).toBe('sell');
      expect(trade.tradeId).toBe('123456789');
    });

    it('应该标准化资金费率', () => {
      const rawData = {
        s: 'BTCUSDT',
        p: '50000.00',
        i: '50005.00',
        r: '0.0001',
        T: Date.now() + 8 * 3600000,
        E: Date.now(),
      };

      const fundingRate = engine._normalizeBinanceFundingRate(rawData);

      expect(fundingRate.exchange).toBe('binance');
      expect(fundingRate.symbol).toBe('BTC/USDT');
      expect(fundingRate.markPrice).toBe(50000);
      expect(fundingRate.indexPrice).toBe(50005);
      expect(fundingRate.fundingRate).toBe(0.0001);
    });

    it('应该标准化 K 线数据', () => {
      const rawData = {
        e: 'kline',
        s: 'BTCUSDT',
        E: Date.now(),
        k: {
          t: Date.now() - 3600000,
          T: Date.now(),
          i: '1h',
          o: '49000',
          c: '50000',
          h: '51000',
          l: '48500',
          v: '1000',
          q: '50000000',
          n: 5000,
          x: true,
        },
      };

      const kline = engine._normalizeBinanceKline(rawData);

      expect(kline.exchange).toBe('binance');
      expect(kline.symbol).toBe('BTC/USDT');
      expect(kline.open).toBe(49000);
      expect(kline.close).toBe(50000);
      expect(kline.high).toBe(51000);
      expect(kline.low).toBe(48500);
      expect(kline.volume).toBe(1000);
      expect(kline.trades).toBe(5000);
      expect(kline.isClosed).toBe(true);
    });
  });

  describe('数据标准化 - Bybit', () => {
    it('应该标准化 ticker', () => {
      const rawMessage = {
        topic: 'tickers.BTCUSDT',
        ts: Date.now(),
        data: {
          symbol: 'BTCUSDT',
          lastPrice: '50000',
          bid1Price: '49990',
          bid1Size: '1.5',
          ask1Price: '50010',
          ask1Size: '2.0',
          prevPrice24h: '49000',
          highPrice24h: '51000',
          lowPrice24h: '48000',
          volume24h: '10000',
          turnover24h: '500000000',
          price24hPcnt: '0.0204',
          fundingRate: '0.0001',
          nextFundingTime: '1703131200000',
        },
      };

      const ticker = engine._normalizeBybitTicker(rawMessage);

      expect(ticker.exchange).toBe('bybit');
      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.last).toBe(50000);
      expect(ticker.fundingRate).toBe(0.0001);
    });

    it('应该标准化深度数据', () => {
      const rawMessage = {
        topic: 'orderbook.50.BTCUSDT',
        ts: Date.now(),
        data: {
          s: 'BTCUSDT',
          b: [['50000', '1.0'], ['49990', '2.0']],
          a: [['50010', '1.5'], ['50020', '0.5']],
        },
      };

      const depth = engine._normalizeBybitDepth(rawMessage);

      expect(depth.exchange).toBe('bybit');
      expect(depth.symbol).toBe('BTC/USDT');
      expect(depth.bids).toHaveLength(2);
      expect(depth.asks).toHaveLength(2);
    });

    it('应该标准化成交数据', () => {
      const rawMessage = {
        topic: 'publicTrade.BTCUSDT',
        ts: Date.now(),
        data: [
          {
            i: 'trade123',
            p: '50000',
            v: '0.1',
            S: 'Buy',
            T: Date.now(),
          },
        ],
      };

      const trades = engine._normalizeBybitTrade(rawMessage);

      expect(trades).toHaveLength(1);
      expect(trades[0].exchange).toBe('bybit');
      expect(trades[0].symbol).toBe('BTC/USDT');
      expect(trades[0].price).toBe(50000);
      expect(trades[0].side).toBe('buy');
    });

    it('应该标准化 K 线数据', () => {
      const rawMessage = {
        topic: 'kline.60.BTCUSDT',
        data: [{
          start: Date.now() - 3600000,
          end: Date.now(),
          interval: '60',
          open: '49000',
          close: '50000',
          high: '51000',
          low: '48500',
          volume: '1000',
          turnover: '50000000',
          confirm: true,
          timestamp: Date.now(),
        }],
      };

      const kline = engine._normalizeBybitKline(rawMessage);

      expect(kline.exchange).toBe('bybit');
      expect(kline.symbol).toBe('BTC/USDT');
      expect(kline.open).toBe(49000);
      expect(kline.close).toBe(50000);
      expect(kline.isClosed).toBe(true);
    });
  });

  describe('数据标准化 - OKX', () => {
    it('应该标准化 ticker', () => {
      const rawMessage = {
        arg: { channel: 'tickers', instId: 'BTC-USDT-SWAP' },
        data: [{
          last: '50000',
          bidPx: '49990',
          bidSz: '1.5',
          askPx: '50010',
          askSz: '2.0',
          open24h: '49000',
          high24h: '51000',
          low24h: '48000',
          vol24h: '10000',
          volCcy24h: '500000000',
          ts: Date.now().toString(),
        }],
      };

      const ticker = engine._normalizeOKXTicker(rawMessage);

      expect(ticker.exchange).toBe('okx');
      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.last).toBe(50000);
      expect(ticker.bid).toBe(49990);
      expect(ticker.ask).toBe(50010);
    });

    it('应该标准化深度数据', () => {
      const rawMessage = {
        arg: { channel: 'books5', instId: 'BTC-USDT-SWAP' },
        data: [{
          bids: [['50000', '1.0'], ['49990', '2.0']],
          asks: [['50010', '1.5'], ['50020', '0.5']],
          ts: Date.now().toString(),
        }],
      };

      const depth = engine._normalizeOKXDepth(rawMessage);

      expect(depth.exchange).toBe('okx');
      expect(depth.symbol).toBe('BTC/USDT');
      expect(depth.bids).toHaveLength(2);
      expect(depth.asks).toHaveLength(2);
    });

    it('应该标准化成交数据', () => {
      const rawMessage = {
        arg: { channel: 'trades', instId: 'BTC-USDT-SWAP' },
        data: [{
          tradeId: 'trade123',
          px: '50000',
          sz: '0.1',
          side: 'buy',
          ts: Date.now().toString(),
        }],
      };

      const trades = engine._normalizeOKXTrade(rawMessage);

      expect(trades).toHaveLength(1);
      expect(trades[0].exchange).toBe('okx');
      expect(trades[0].symbol).toBe('BTC/USDT');
      expect(trades[0].price).toBe(50000);
    });

    it('应该标准化资金费率', () => {
      const rawMessage = {
        arg: { channel: 'funding-rate', instId: 'BTC-USDT-SWAP' },
        data: [{
          fundingRate: '0.0001',
          nextFundingRate: '0.00012',
          fundingTime: (Date.now() + 8 * 3600000).toString(),
          ts: Date.now().toString(),
        }],
      };

      const fundingRate = engine._normalizeOKXFundingRate(rawMessage);

      expect(fundingRate.exchange).toBe('okx');
      expect(fundingRate.symbol).toBe('BTC/USDT');
      expect(fundingRate.fundingRate).toBe(0.0001);
      expect(fundingRate.nextFundingRate).toBe(0.00012);
    });

    it('应该标准化 K 线数据', () => {
      const rawMessage = {
        arg: { channel: 'candle1H', instId: 'BTC-USDT-SWAP' },
        data: [[
          Date.now().toString(),
          '49000',
          '51000',
          '48500',
          '50000',
          '1000',
          '50000000',
          '50000000',
          '1',
        ]],
      };

      const kline = engine._normalizeOKXKline(rawMessage);

      expect(kline.exchange).toBe('okx');
      expect(kline.symbol).toBe('BTC/USDT');
      expect(kline.open).toBe(49000);
      expect(kline.close).toBe(50000);
      expect(kline.high).toBe(51000);
      expect(kline.low).toBe(48500);
      expect(kline.isClosed).toBe(true);
    });
  });

  describe('通用标准化方法', () => {
    it('应该调用正确的标准化方法 (ticker)', () => {
      const binanceData = {
        e: '24hrTicker',
        s: 'BTCUSDT',
        c: '50000',
        b: '49990',
        B: '1',
        a: '50010',
        A: '1',
        o: '49000',
        h: '51000',
        l: '48000',
        v: '10000',
        q: '500000000',
        p: '1000',
        P: '2',
        E: Date.now(),
      };

      const ticker = engine._normalizeTicker('binance', binanceData);
      expect(ticker).not.toBeNull();
      expect(ticker.exchange).toBe('binance');
    });

    it('应该返回 null 对于未知交易所', () => {
      const ticker = engine._normalizeTicker('unknown', {});
      expect(ticker).toBeNull();
    });

    it('应该处理标准化错误', () => {
      const ticker = engine._normalizeTicker('binance', null);
      expect(ticker).toBeNull();
    });

    it('应该正确标准化深度数据', () => {
      const binanceData = {
        s: 'BTCUSDT',
        b: [['50000', '1']],
        a: [['50010', '1']],
        E: Date.now(),
      };

      const depth = engine._normalizeDepth('binance', binanceData);
      expect(depth).not.toBeNull();
    });

    it('应该正确标准化成交数据', () => {
      const binanceData = {
        s: 'BTCUSDT',
        t: 123,
        p: '50000',
        q: '0.1',
        m: true,
        T: Date.now(),
      };

      const trades = engine._normalizeTrade('binance', binanceData);
      expect(trades).toHaveLength(1);
    });

    it('应该正确标准化资金费率', () => {
      const binanceData = {
        s: 'BTCUSDT',
        p: '50000',
        i: '50005',
        r: '0.0001',
        T: Date.now(),
        E: Date.now(),
      };

      const fundingRate = engine._normalizeFundingRate('binance', binanceData);
      expect(fundingRate).not.toBeNull();
    });

    it('应该返回 null 对于 Bybit 资金费率 (在 ticker 中)', () => {
      const fundingRate = engine._normalizeFundingRate('bybit', {});
      expect(fundingRate).toBeNull();
    });
  });

  describe('心跳配置检查', () => {
    it('应该在心跳未启用时跳过', () => {
      engine.config.heartbeat.enabled = false;
      engine._startHeartbeat('binance');

      expect(engine.heartbeatTimers.has('binance')).toBe(false);
    });

    it('应该在没有连接时跳过心跳', () => {
      engine.config.heartbeat.enabled = true;
      engine._startHeartbeat('binance');

      // 没有实际连接，所以不会创建定时器
      expect(engine.heartbeatTimers.has('binance')).toBe(false);
    });
  });

  describe('引擎状态检查', () => {
    it('应该正确报告未运行状态', () => {
      expect(engine.running).toBe(false);
    });

    it('应该正确报告未初始化状态', () => {
      expect(engine.initialized).toBe(false);
    });
  });
});

describe('MarketDataEngine 常量导出', () => {
  it('应该导出 DATA_TYPES', () => {
    expect(DATA_TYPES).toBeDefined();
    expect(DATA_TYPES.TICKER).toBe('ticker');
    expect(DATA_TYPES.DEPTH).toBe('depth');
    expect(DATA_TYPES.TRADE).toBe('trade');
    expect(DATA_TYPES.FUNDING_RATE).toBe('fundingRate');
    expect(DATA_TYPES.KLINE).toBe('kline');
  });

  it('应该导出 REDIS_KEYS', () => {
    expect(REDIS_KEYS).toBeDefined();
    expect(REDIS_KEYS.TICKER_HASH).toBe('market:ticker:');
    expect(REDIS_KEYS.DEPTH_HASH).toBe('market:depth:');
    expect(REDIS_KEYS.TRADE_STREAM).toBe('market:trades:');
    expect(REDIS_KEYS.FUNDING_HASH).toBe('market:funding:');
    expect(REDIS_KEYS.KLINE_HASH).toBe('market:kline:');
    expect(REDIS_KEYS.CHANNEL).toBe('market_data');
  });
});

describe('MarketDataEngine 边界条件', () => {
  it('应该处理空深度数据', () => {
    const engine = new MarketDataEngine({});

    const depth = engine._normalizeBinanceDepth({
      s: 'BTCUSDT',
      b: [],
      a: [],
      E: Date.now(),
    });

    expect(depth.bids).toHaveLength(0);
    expect(depth.asks).toHaveLength(0);
  });

  it('应该处理 undefined bids/asks', () => {
    const engine = new MarketDataEngine({});

    const depth = engine._normalizeBinanceDepth({
      s: 'BTCUSDT',
      E: Date.now(),
    });

    expect(depth.bids).toHaveLength(0);
    expect(depth.asks).toHaveLength(0);
  });

  it('应该处理多笔成交数据 (OKX)', () => {
    const engine = new MarketDataEngine({});

    const rawMessage = {
      arg: { channel: 'trades', instId: 'BTC-USDT-SWAP' },
      data: [
        { tradeId: '1', px: '50000', sz: '0.1', side: 'buy', ts: Date.now().toString() },
        { tradeId: '2', px: '50001', sz: '0.2', side: 'sell', ts: Date.now().toString() },
      ],
    };

    const trades = engine._normalizeOKXTrade(rawMessage);

    expect(trades).toHaveLength(2);
    expect(trades[0].tradeId).toBe('1');
    expect(trades[1].tradeId).toBe('2');
  });

  it('应该处理 Bybit 没有资金费率的情况', () => {
    const engine = new MarketDataEngine({});

    const rawMessage = {
      topic: 'tickers.BTCUSDT',
      ts: Date.now(),
      data: {
        symbol: 'BTCUSDT',
        lastPrice: '50000',
        bid1Price: '49990',
        bid1Size: '1.5',
        ask1Price: '50010',
        ask1Size: '2.0',
        prevPrice24h: '49000',
        highPrice24h: '51000',
        lowPrice24h: '48000',
        volume24h: '10000',
        turnover24h: '500000000',
        price24hPcnt: '0.0204',
        // 没有 fundingRate
      },
    };

    const ticker = engine._normalizeBybitTicker(rawMessage);
    expect(ticker.fundingRate).toBeNull();
    expect(ticker.nextFundingTime).toBeNull();
  });

  it('应该正确计算 OKX 涨跌幅', () => {
    const engine = new MarketDataEngine({});

    const rawMessage = {
      arg: { channel: 'tickers', instId: 'BTC-USDT-SWAP' },
      data: [{
        last: '50000',
        open24h: '49000',
        bidPx: '49990',
        bidSz: '1',
        askPx: '50010',
        askSz: '1',
        high24h: '51000',
        low24h: '48000',
        vol24h: '10000',
        volCcy24h: '500000000',
        ts: Date.now().toString(),
      }],
    };

    const ticker = engine._normalizeOKXTicker(rawMessage);
    expect(ticker.change).toBe(1000); // 50000 - 49000
    expect(ticker.changePercent).toBeCloseTo(2.04, 1); // ((50000 - 49000) / 49000) * 100
  });
});
