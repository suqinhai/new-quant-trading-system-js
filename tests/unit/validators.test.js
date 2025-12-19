/**
 * 验证器单元测试
 * Validators Module Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateOrder,
  validateCandle,
  validateCandles,
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPercentage,
  isValidRatio,
  isNonEmptyString,
  isValidDate,
  isValidEmail,
  isValidUrl,
  isInRange,
  clamp,
} from '../../src/utils/validators.js';

describe('Validators Module', () => {
  describe('Order Validation', () => {
    describe('validateOrder', () => {
      it('should validate a correct order', () => {
        const order = {
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: 0.01,
          price: 50000,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, true);
      });

      it('should reject order without symbol', () => {
        const order = {
          side: 'buy',
          type: 'limit',
          amount: 0.01,
          price: 50000,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, false);
      });

      it('should reject order with invalid side', () => {
        const order = {
          symbol: 'BTC/USDT',
          side: 'invalid',
          type: 'limit',
          amount: 0.01,
          price: 50000,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, false);
      });

      it('should reject order with zero amount', () => {
        const order = {
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: 0,
          price: 50000,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, false);
      });

      it('should reject limit order without price', () => {
        const order = {
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: 0.01,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, false);
      });

      it('should allow market order without price', () => {
        const order = {
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 0.01,
        };
        const result = validateOrder(order);
        assert.strictEqual(result.valid, true);
      });
    });
  });

  describe('Candle Validation', () => {
    describe('validateCandle', () => {
      it('should validate a correct candle', () => {
        const candle = {
          timestamp: Date.now(),
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
        };
        const result = validateCandle(candle);
        assert.strictEqual(result.valid, true);
      });

      it('should reject candle with high < low', () => {
        const candle = {
          timestamp: Date.now(),
          open: 50000,
          high: 49000, // Invalid: high < low
          low: 51000,
          close: 50500,
          volume: 100,
        };
        const result = validateCandle(candle);
        assert.strictEqual(result.valid, false);
      });

      it('should reject candle with negative volume', () => {
        const candle = {
          timestamp: Date.now(),
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: -100,
        };
        const result = validateCandle(candle);
        assert.strictEqual(result.valid, false);
      });
    });

    describe('validateCandles', () => {
      it('should validate an array of candles', () => {
        const candles = [
          { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 10 },
          { timestamp: 2000, open: 105, high: 115, low: 95, close: 110, volume: 15 },
        ];
        const result = validateCandles(candles);
        assert.strictEqual(result.valid, true);
      });

      it('should reject empty array', () => {
        const result = validateCandles([]);
        assert.strictEqual(result.valid, false);
      });
    });
  });

  describe('Type Validation', () => {
    describe('isValidNumber', () => {
      it('should return true for valid numbers', () => {
        assert.strictEqual(isValidNumber(0), true);
        assert.strictEqual(isValidNumber(123), true);
        assert.strictEqual(isValidNumber(-456), true);
        assert.strictEqual(isValidNumber(3.14), true);
      });

      it('should return false for invalid numbers', () => {
        assert.strictEqual(isValidNumber(NaN), false);
        assert.strictEqual(isValidNumber(Infinity), false);
        assert.strictEqual(isValidNumber(-Infinity), false);
        assert.strictEqual(isValidNumber('123'), false);
        assert.strictEqual(isValidNumber(null), false);
        assert.strictEqual(isValidNumber(undefined), false);
      });
    });

    describe('isPositiveNumber', () => {
      it('should return true for positive numbers', () => {
        assert.strictEqual(isPositiveNumber(1), true);
        assert.strictEqual(isPositiveNumber(0.001), true);
      });

      it('should return false for zero and negative', () => {
        assert.strictEqual(isPositiveNumber(0), false);
        assert.strictEqual(isPositiveNumber(-1), false);
      });
    });

    describe('isNonNegativeNumber', () => {
      it('should return true for zero and positive', () => {
        assert.strictEqual(isNonNegativeNumber(0), true);
        assert.strictEqual(isNonNegativeNumber(1), true);
      });

      it('should return false for negative', () => {
        assert.strictEqual(isNonNegativeNumber(-1), false);
      });
    });

    describe('isValidPercentage', () => {
      it('should validate percentages 0-100', () => {
        assert.strictEqual(isValidPercentage(0), true);
        assert.strictEqual(isValidPercentage(50), true);
        assert.strictEqual(isValidPercentage(100), true);
        assert.strictEqual(isValidPercentage(-1), false);
        assert.strictEqual(isValidPercentage(101), false);
      });
    });

    describe('isValidRatio', () => {
      it('should validate ratios 0-1', () => {
        assert.strictEqual(isValidRatio(0), true);
        assert.strictEqual(isValidRatio(0.5), true);
        assert.strictEqual(isValidRatio(1), true);
        assert.strictEqual(isValidRatio(-0.1), false);
        assert.strictEqual(isValidRatio(1.1), false);
      });
    });

    describe('isNonEmptyString', () => {
      it('should validate non-empty strings', () => {
        assert.strictEqual(isNonEmptyString('hello'), true);
        assert.strictEqual(isNonEmptyString(''), false);
        assert.strictEqual(isNonEmptyString('  '), false);
        assert.strictEqual(isNonEmptyString(null), false);
      });
    });

    describe('isValidDate', () => {
      it('should validate dates', () => {
        assert.strictEqual(isValidDate(new Date()), true);
        assert.strictEqual(isValidDate(new Date('2024-01-01')), true);
        assert.strictEqual(isValidDate('2024-01-01'), true); // String dates are also valid
        assert.strictEqual(isValidDate(new Date('invalid')), false);
        assert.strictEqual(isValidDate('not a date'), false);
      });
    });

    describe('isValidEmail', () => {
      it('should validate email addresses', () => {
        assert.strictEqual(isValidEmail('test@example.com'), true);
        assert.strictEqual(isValidEmail('user.name@domain.co.uk'), true);
        assert.strictEqual(isValidEmail('invalid'), false);
        assert.strictEqual(isValidEmail('@domain.com'), false);
        assert.strictEqual(isValidEmail('user@'), false);
      });
    });

    describe('isValidUrl', () => {
      it('should validate URLs', () => {
        assert.strictEqual(isValidUrl('https://example.com'), true);
        assert.strictEqual(isValidUrl('http://localhost:3000'), true);
        assert.strictEqual(isValidUrl('invalid'), false);
        assert.strictEqual(isValidUrl('ftp://file.com'), true);
      });
    });
  });

  describe('Range Validation', () => {
    describe('isInRange', () => {
      it('should check if value is in range', () => {
        assert.strictEqual(isInRange(5, 0, 10), true);
        assert.strictEqual(isInRange(0, 0, 10), true);
        assert.strictEqual(isInRange(10, 0, 10), true);
        assert.strictEqual(isInRange(-1, 0, 10), false);
        assert.strictEqual(isInRange(11, 0, 10), false);
      });
    });

    describe('clamp', () => {
      it('should clamp value to range', () => {
        assert.strictEqual(clamp(5, 0, 10), 5);
        assert.strictEqual(clamp(-5, 0, 10), 0);
        assert.strictEqual(clamp(15, 0, 10), 10);
      });
    });
  });
});
