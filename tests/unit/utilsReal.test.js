/**
 * 真实工具模块测试
 * Real Utils Module Tests
 * @module tests/unit/utilsReal.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  toNumber,
  add,
  subtract,
  multiply,
  divide,
  round,
  floor,
  ceil,
  percentChange,
  average,
  standardDeviation,
  max,
  min,
  sum,
  last,
  formatDate,
  parseInterval,
  sleep,
  now,
  alignToInterval,
  randomId,
  formatCurrency,
  formatPercent,
  deepClone,
  deepMerge,
  get,
  isValidSymbol,
  isValidSide,
  isValidOrderType,
  isPositive,
} from '../../src/utils/helpers.js';

import {
  SMA,
  EMA,
  RSI,
  MACD,
  BollingerBands,
  ATR,
  PivotPoints,
  FibonacciRetracement,
  getLatest,
  detectCrossover,
  Momentum,
  ROC,
} from '../../src/utils/indicators.js';

import {
  encrypt,
  decrypt,
  encryptKeys,
  decryptKeys,
  generateMasterPassword,
  validatePasswordStrength,
  encryptValue,
  decryptValue,
  isEncrypted,
  decryptObject,
} from '../../src/utils/crypto.js';

// ============================================
// helpers.js 测试
// ============================================

describe('Helpers (Real)', () => {
  describe('数字处理', () => {
    describe('toNumber', () => {
      it('应该转换有效数字', () => {
        expect(toNumber(123)).toBe(123);
        expect(toNumber('456')).toBe(456);
        expect(toNumber('123.45')).toBe(123.45);
      });

      it('应该处理无效输入', () => {
        expect(toNumber('abc', 0)).toBe(0);
        // null 和 undefined 会被 Number() 转换为 0 和 NaN
        expect(toNumber(null, 10)).toBe(0); // Number(null) === 0
        expect(toNumber(undefined, 5)).toBe(5); // Number(undefined) === NaN
        expect(toNumber(NaN, 100)).toBe(100);
      });
    });

    describe('高精度计算', () => {
      it('add 应该正确计算', () => {
        expect(add(0.1, 0.2)).toBeCloseTo(0.3, 10);
        expect(add(100, 200)).toBe(300);
      });

      it('subtract 应该正确计算', () => {
        expect(subtract(0.3, 0.1)).toBeCloseTo(0.2, 10);
        expect(subtract(300, 100)).toBe(200);
      });

      it('multiply 应该正确计算', () => {
        expect(multiply(0.1, 0.2)).toBeCloseTo(0.02, 10);
        expect(multiply(10, 20)).toBe(200);
      });

      it('divide 应该正确计算', () => {
        expect(divide(0.3, 0.1)).toBeCloseTo(3, 10);
        expect(divide(100, 4)).toBe(25);
      });

      it('divide 应该处理除以零', () => {
        expect(divide(100, 0)).toBe(0);
      });
    });

    describe('取整函数', () => {
      it('round 应该四舍五入', () => {
        expect(round(1.234, 2)).toBe(1.23);
        expect(round(1.235, 2)).toBe(1.24);
        expect(round(1.5, 0)).toBe(2);
      });

      it('floor 应该向下取整', () => {
        expect(floor(1.999, 2)).toBe(1.99);
        expect(floor(1.234, 1)).toBe(1.2);
      });

      it('ceil 应该向上取整', () => {
        expect(ceil(1.001, 2)).toBe(1.01);
        expect(ceil(1.234, 1)).toBe(1.3);
      });
    });

    describe('percentChange', () => {
      it('应该计算正向变化', () => {
        expect(percentChange(100, 110)).toBe(10);
      });

      it('应该计算负向变化', () => {
        expect(percentChange(100, 90)).toBe(-10);
      });

      it('应该处理从零开始', () => {
        expect(percentChange(0, 100)).toBe(100);
        expect(percentChange(0, -100)).toBe(-100);
        expect(percentChange(0, 0)).toBe(0);
      });
    });
  });

  describe('数组处理', () => {
    describe('average', () => {
      it('应该计算平均值', () => {
        expect(average([1, 2, 3, 4, 5])).toBe(3);
        expect(average([10, 20, 30])).toBe(20);
      });

      it('应该处理空数组', () => {
        expect(average([])).toBe(0);
        expect(average(null)).toBe(0);
      });
    });

    describe('standardDeviation', () => {
      it('应该计算标准差', () => {
        const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeCloseTo(2, 0);
      });

      it('应该处理空数组', () => {
        expect(standardDeviation([])).toBe(0);
        expect(standardDeviation([1])).toBe(0);
      });
    });

    describe('max/min', () => {
      it('max 应该返回最大值', () => {
        expect(max([1, 5, 3, 9, 2])).toBe(9);
      });

      it('min 应该返回最小值', () => {
        expect(min([1, 5, 3, 9, 2])).toBe(1);
      });

      it('应该处理空数组', () => {
        expect(max([])).toBe(0);
        expect(min([])).toBe(0);
      });
    });

    describe('sum', () => {
      it('应该计算总和', () => {
        expect(sum([1, 2, 3, 4, 5])).toBe(15);
      });

      it('应该处理空数组', () => {
        expect(sum([])).toBe(0);
      });
    });

    describe('last', () => {
      it('应该返回最后一个元素', () => {
        expect(last([1, 2, 3])).toBe(3);
      });

      it('应该返回最后 N 个元素', () => {
        expect(last([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
      });

      it('应该处理空数组', () => {
        expect(last([])).toBeUndefined();
        expect(last([], 3)).toEqual([]);
      });
    });
  });

  describe('时间处理', () => {
    describe('formatDate', () => {
      it('应该格式化日期', () => {
        const date = new Date('2024-01-15T10:30:45.123Z');
        expect(formatDate(date, 'YYYY-MM-DD')).toBe('2024-01-15');
      });

      it('应该处理无效日期', () => {
        expect(formatDate('invalid')).toBe('Invalid Date');
      });
    });

    describe('parseInterval', () => {
      it('应该解析时间间隔', () => {
        expect(parseInterval('1s')).toBe(1000);
        expect(parseInterval('1m')).toBe(60000);
        expect(parseInterval('1h')).toBe(3600000);
        expect(parseInterval('1d')).toBe(86400000);
        expect(parseInterval('1w')).toBe(604800000);
      });

      it('应该解析多单位间隔', () => {
        expect(parseInterval('5m')).toBe(300000);
        expect(parseInterval('15m')).toBe(900000);
      });

      it('应该处理无效格式', () => {
        expect(parseInterval('invalid')).toBe(60000);
      });
    });

    describe('sleep', () => {
      it('应该延迟执行', async () => {
        const start = Date.now();
        await sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(40);
      });
    });

    describe('now', () => {
      it('应该返回当前时间戳', () => {
        const timestamp = now();
        expect(timestamp).toBeGreaterThan(0);
        expect(typeof timestamp).toBe('number');
      });
    });

    describe('alignToInterval', () => {
      it('应该对齐到时间间隔', () => {
        const ts = 1705312345678;
        const aligned = alignToInterval(ts, '1m');
        expect(aligned % 60000).toBe(0);
      });
    });
  });

  describe('字符串处理', () => {
    describe('randomId', () => {
      it('应该生成指定长度的随机 ID', () => {
        const id = randomId(16);
        expect(id.length).toBe(16);
      });

      it('应该生成不同的 ID', () => {
        const id1 = randomId();
        const id2 = randomId();
        expect(id1).not.toBe(id2);
      });
    });

    describe('formatCurrency', () => {
      it('应该格式化货币', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(1000, '¥', 0)).toBe('¥1,000');
      });
    });

    describe('formatPercent', () => {
      it('应该格式化百分比', () => {
        expect(formatPercent(10)).toBe('+10%');
        expect(formatPercent(-5)).toBe('-5%');
        expect(formatPercent(0)).toBe('0%');
      });
    });
  });

  describe('对象处理', () => {
    describe('deepClone', () => {
      it('应该深拷贝对象', () => {
        const obj = { a: 1, b: { c: 2 } };
        const cloned = deepClone(obj);

        expect(cloned).toEqual(obj);
        expect(cloned).not.toBe(obj);
        expect(cloned.b).not.toBe(obj.b);
      });

      it('应该处理数组', () => {
        const arr = [1, { a: 2 }, [3, 4]];
        const cloned = deepClone(arr);

        expect(cloned).toEqual(arr);
        expect(cloned).not.toBe(arr);
      });

      it('应该处理 Date 对象', () => {
        const date = new Date();
        const cloned = deepClone(date);

        expect(cloned.getTime()).toBe(date.getTime());
        expect(cloned).not.toBe(date);
      });

      it('应该处理 null 和原始类型', () => {
        expect(deepClone(null)).toBeNull();
        expect(deepClone(123)).toBe(123);
        expect(deepClone('str')).toBe('str');
      });
    });

    describe('deepMerge', () => {
      it('应该深度合并对象', () => {
        const target = { a: 1, b: { c: 2 } };
        const source = { b: { d: 3 }, e: 4 };
        const merged = deepMerge(target, source);

        expect(merged).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
      });

      it('不应该修改原对象', () => {
        const target = { a: 1 };
        const source = { b: 2 };
        deepMerge(target, source);

        expect(target).toEqual({ a: 1 });
      });
    });

    describe('get', () => {
      it('应该获取嵌套属性', () => {
        const obj = { a: { b: { c: 123 } } };
        expect(get(obj, 'a.b.c')).toBe(123);
      });

      it('应该返回默认值', () => {
        const obj = { a: 1 };
        expect(get(obj, 'a.b.c', 'default')).toBe('default');
        expect(get(null, 'a.b', 'default')).toBe('default');
      });
    });
  });

  describe('验证函数', () => {
    describe('isValidSymbol', () => {
      it('应该验证有效交易对', () => {
        expect(isValidSymbol('BTC/USDT')).toBe(true);
        expect(isValidSymbol('ETH/BTC')).toBe(true);
      });

      it('应该拒绝无效交易对', () => {
        expect(isValidSymbol('BTCUSDT')).toBe(false);
        expect(isValidSymbol('')).toBe(false);
        expect(isValidSymbol(null)).toBe(false);
      });
    });

    describe('isValidSide', () => {
      it('应该验证有效订单方向', () => {
        expect(isValidSide('buy')).toBe(true);
        expect(isValidSide('sell')).toBe(true);
        expect(isValidSide('BUY')).toBe(true);
      });

      it('应该拒绝无效订单方向', () => {
        expect(isValidSide('long')).toBe(false);
        expect(isValidSide(null)).toBe(false);
      });
    });

    describe('isValidOrderType', () => {
      it('应该验证有效订单类型', () => {
        expect(isValidOrderType('market')).toBe(true);
        expect(isValidOrderType('limit')).toBe(true);
        expect(isValidOrderType('stop')).toBe(true);
        expect(isValidOrderType('stop_limit')).toBe(true);
      });

      it('应该拒绝无效订单类型', () => {
        expect(isValidOrderType('invalid')).toBe(false);
      });
    });

    describe('isPositive', () => {
      it('应该验证正数', () => {
        expect(isPositive(1)).toBe(true);
        expect(isPositive(0.001)).toBe(true);
      });

      it('应该拒绝非正数', () => {
        expect(isPositive(0)).toBe(false);
        expect(isPositive(-1)).toBe(false);
      });
    });
  });
});

// ============================================
// indicators.js 测试
// ============================================

describe('Indicators (Real)', () => {
  // 生成测试数据
  const prices = Array.from({ length: 50 }, (_, i) => 50000 + Math.sin(i * 0.1) * 1000);

  const candles = prices.map((close, i) => ({
    high: close + 100,
    low: close - 100,
    close,
    volume: 1000 + i * 10,
  }));

  describe('移动平均线', () => {
    describe('SMA', () => {
      it('应该计算简单移动平均', () => {
        const result = SMA(prices, 10);
        expect(result.length).toBe(prices.length - 9);
        expect(result[0]).toBeGreaterThan(0);
      });
    });

    describe('EMA', () => {
      it('应该计算指数移动平均', () => {
        const result = EMA(prices, 10);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBeGreaterThan(0);
      });
    });
  });

  describe('震荡指标', () => {
    describe('RSI', () => {
      it('应该计算 RSI', () => {
        const result = RSI(prices, 14);
        expect(result.length).toBeGreaterThan(0);

        // RSI 应该在 0-100 之间
        result.forEach(rsi => {
          expect(rsi).toBeGreaterThanOrEqual(0);
          expect(rsi).toBeLessThanOrEqual(100);
        });
      });
    });
  });

  describe('趋势指标', () => {
    describe('MACD', () => {
      it('应该计算 MACD', () => {
        const result = MACD(prices, 12, 26, 9);
        expect(result.length).toBeGreaterThan(0);

        const latest = result[result.length - 1];
        expect(latest).toHaveProperty('MACD');
        expect(latest).toHaveProperty('signal');
        expect(latest).toHaveProperty('histogram');
      });
    });
  });

  describe('波动率指标', () => {
    describe('BollingerBands', () => {
      it('应该计算布林带', () => {
        const result = BollingerBands(prices, 20, 2);
        expect(result.length).toBeGreaterThan(0);

        const latest = result[result.length - 1];
        expect(latest).toHaveProperty('upper');
        expect(latest).toHaveProperty('middle');
        expect(latest).toHaveProperty('lower');
        expect(latest.upper).toBeGreaterThan(latest.middle);
        expect(latest.middle).toBeGreaterThan(latest.lower);
      });
    });

    describe('ATR', () => {
      it('应该计算 ATR', () => {
        const result = ATR(candles, 14);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBeGreaterThan(0);
      });
    });
  });

  describe('动量指标', () => {
    describe('Momentum', () => {
      it('应该计算动量', () => {
        const result = Momentum(prices, 10);
        expect(result.length).toBe(prices.length - 10);
      });
    });

    describe('ROC', () => {
      it('应该计算变化率', () => {
        const result = ROC(prices, 10);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('支撑阻力', () => {
    describe('PivotPoints', () => {
      it('应该计算枢轴点', () => {
        const result = PivotPoints(51000, 49000, 50000);

        expect(result).toHaveProperty('pp');
        expect(result).toHaveProperty('r1');
        expect(result).toHaveProperty('r2');
        expect(result).toHaveProperty('r3');
        expect(result).toHaveProperty('s1');
        expect(result).toHaveProperty('s2');
        expect(result).toHaveProperty('s3');

        // 验证顺序
        expect(result.r3).toBeGreaterThan(result.r2);
        expect(result.r2).toBeGreaterThan(result.r1);
        expect(result.r1).toBeGreaterThan(result.pp);
        expect(result.pp).toBeGreaterThan(result.s1);
        expect(result.s1).toBeGreaterThan(result.s2);
        expect(result.s2).toBeGreaterThan(result.s3);
      });
    });

    describe('FibonacciRetracement', () => {
      it('应该计算斐波那契回撤', () => {
        const result = FibonacciRetracement(51000, 49000);

        expect(result.level0).toBe(49000);
        expect(result.level1000).toBe(51000);
        expect(result.level500).toBe(50000);
        expect(result.level618).toBeCloseTo(50236, 0);
      });
    });
  });

  describe('辅助函数', () => {
    describe('getLatest', () => {
      it('应该返回最新值', () => {
        expect(getLatest([1, 2, 3])).toBe(3);
      });

      it('应该处理空数组', () => {
        expect(getLatest([])).toBeNull();
        expect(getLatest(null)).toBeNull();
      });
    });

    describe('detectCrossover', () => {
      it('应该检测金叉', () => {
        const fast = [10, 20];
        const slow = [15, 15];
        const result = detectCrossover(fast, slow);

        expect(result.bullish).toBe(true);
        expect(result.bearish).toBe(false);
      });

      it('应该检测死叉', () => {
        const fast = [20, 10];
        const slow = [15, 15];
        const result = detectCrossover(fast, slow);

        expect(result.bullish).toBe(false);
        expect(result.bearish).toBe(true);
      });

      it('应该处理数据不足', () => {
        const result = detectCrossover([1], [1]);
        expect(result.bullish).toBe(false);
        expect(result.bearish).toBe(false);
      });
    });
  });
});

// ============================================
// crypto.js 测试
// ============================================

describe('Crypto (Real)', () => {
  const masterPassword = 'test-master-password-12345!';

  describe('encrypt/decrypt', () => {
    it('应该正确加密和解密', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext, masterPassword);
      const decrypted = decrypt(encrypted, masterPassword);

      expect(decrypted).toBe(plaintext);
    });

    it('每次加密结果应该不同', () => {
      const plaintext = 'Same text';
      const encrypted1 = encrypt(plaintext, masterPassword);
      const encrypted2 = encrypt(plaintext, masterPassword);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('应该在密码错误时抛出错误', () => {
      const encrypted = encrypt('test', masterPassword);

      expect(() => decrypt(encrypted, 'wrong-password')).toThrow();
    });
  });

  describe('encryptKeys/decryptKeys', () => {
    it('应该正确加密和解密密钥对象', () => {
      const keys = {
        apiKey: 'my-api-key',
        apiSecret: 'my-api-secret',
      };

      const encrypted = encryptKeys(keys, masterPassword);
      const decrypted = decryptKeys(encrypted, masterPassword);

      expect(decrypted).toEqual(keys);
    });
  });

  describe('generateMasterPassword', () => {
    it('应该生成指定长度的密码', () => {
      const password = generateMasterPassword(32);
      expect(password.length).toBe(32);
    });

    it('应该生成不同的密码', () => {
      const password1 = generateMasterPassword();
      const password2 = generateMasterPassword();
      expect(password1).not.toBe(password2);
    });
  });

  describe('validatePasswordStrength', () => {
    it('应该验证强密码', () => {
      const result = validatePasswordStrength('StrongP@ss123!');
      expect(result.valid).toBe(true);
      expect(result.level).toBe('strong');
    });

    it('应该拒绝弱密码', () => {
      const result = validatePasswordStrength('weak');
      expect(result.valid).toBe(false);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('应该拒绝太短的密码', () => {
      const result = validatePasswordStrength('Short1!');
      expect(result.valid).toBe(false);
    });
  });

  describe('encryptValue/decryptValue', () => {
    it('应该加密并添加 ENC 前缀', () => {
      const encrypted = encryptValue('secret', masterPassword);
      expect(encrypted.startsWith('ENC(')).toBe(true);
      expect(encrypted.endsWith(')')).toBe(true);
    });

    it('应该正确解密', () => {
      const encrypted = encryptValue('secret', masterPassword);
      const decrypted = decryptValue(encrypted, masterPassword);
      expect(decrypted).toBe('secret');
    });

    it('应该返回非加密值原样', () => {
      const value = 'not-encrypted';
      expect(decryptValue(value, masterPassword)).toBe(value);
    });
  });

  describe('isEncrypted', () => {
    it('应该识别加密值', () => {
      const encrypted = encryptValue('test', masterPassword);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('应该拒绝非加密值', () => {
      expect(isEncrypted('plain text')).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(123)).toBe(false);
    });
  });

  describe('decryptObject', () => {
    it('应该解密对象中的加密值', () => {
      const encrypted = encryptValue('secret', masterPassword);
      const obj = {
        plain: 'value',
        encrypted: encrypted,
        nested: {
          alsoEncrypted: encryptValue('nested-secret', masterPassword),
        },
      };

      const decrypted = decryptObject(obj, masterPassword);

      expect(decrypted.plain).toBe('value');
      expect(decrypted.encrypted).toBe('secret');
      expect(decrypted.nested.alsoEncrypted).toBe('nested-secret');
    });

    it('应该处理非对象输入', () => {
      expect(decryptObject(null, masterPassword)).toBeNull();
      expect(decryptObject('string', masterPassword)).toBe('string');
    });
  });
});
