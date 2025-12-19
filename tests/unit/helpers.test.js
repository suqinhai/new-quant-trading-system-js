/**
 * 辅助函数单元测试
 * Helpers Module Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  toNumber,
  add,
  subtract,
  multiply,
  divide,
  round,
  percentChange,
  average,
  standardDeviation,
  max,
  min,
  sum,
  formatDate,
  sleep,
  randomId,
  deepClone,
  deepMerge,
  isValidSymbol,
  isValidSide,
  isValidOrderType,
  isPositive,
} from '../../src/utils/helpers.js';

describe('Helpers Module', () => {
  describe('Number Operations', () => {
    describe('toNumber', () => {
      it('should convert string to number', () => {
        assert.strictEqual(toNumber('123.45'), 123.45);
      });

      it('should return number as is', () => {
        assert.strictEqual(toNumber(123.45), 123.45);
      });

      it('should return default for invalid input', () => {
        assert.strictEqual(toNumber('abc', 0), 0);
        assert.strictEqual(toNumber(null, 0), 0);
        assert.strictEqual(toNumber(undefined, 0), 0);
      });
    });

    describe('add', () => {
      it('should add two numbers precisely', () => {
        // 0.1 + 0.2 should equal 0.3, not 0.30000000000000004
        assert.strictEqual(add(0.1, 0.2), 0.3);
      });

      it('should handle string inputs', () => {
        assert.strictEqual(add('1.5', '2.5'), 4);
      });
    });

    describe('subtract', () => {
      it('should subtract two numbers precisely', () => {
        assert.strictEqual(subtract(0.3, 0.1), 0.2);
      });
    });

    describe('multiply', () => {
      it('should multiply two numbers precisely', () => {
        assert.strictEqual(multiply(0.1, 0.2), 0.02);
      });
    });

    describe('divide', () => {
      it('should divide two numbers precisely', () => {
        assert.strictEqual(divide(0.3, 0.1), 3);
      });

      it('should return default for division by zero', () => {
        assert.strictEqual(divide(10, 0, 0), 0);
      });
    });

    describe('round', () => {
      it('should round to specified decimal places', () => {
        assert.strictEqual(round(3.14159, 2), 3.14);
        assert.strictEqual(round(3.145, 2), 3.15);
      });
    });

    describe('percentChange', () => {
      it('should calculate percentage change', () => {
        assert.strictEqual(percentChange(100, 110), 10);
        assert.strictEqual(percentChange(100, 90), -10);
      });

      it('should handle zero start value', () => {
        // When from is 0 and to is positive, returns 100
        assert.strictEqual(percentChange(0, 100), 100);
        // When both are 0, returns 0
        assert.strictEqual(percentChange(0, 0), 0);
      });
    });
  });

  describe('Array Operations', () => {
    describe('average', () => {
      it('should calculate average', () => {
        assert.strictEqual(average([1, 2, 3, 4, 5]), 3);
      });

      it('should return 0 for empty array', () => {
        assert.strictEqual(average([]), 0);
      });
    });

    describe('sum', () => {
      it('should calculate sum', () => {
        assert.strictEqual(sum([1, 2, 3, 4, 5]), 15);
      });

      it('should return 0 for empty array', () => {
        assert.strictEqual(sum([]), 0);
      });
    });

    describe('max / min', () => {
      it('should find max value', () => {
        assert.strictEqual(max([1, 5, 3, 9, 2]), 9);
      });

      it('should find min value', () => {
        assert.strictEqual(min([1, 5, 3, 9, 2]), 1);
      });
    });

    describe('standardDeviation', () => {
      it('should calculate standard deviation', () => {
        const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
        assert.ok(Math.abs(result - 2) < 0.01);
      });
    });
  });

  describe('Time Operations', () => {
    describe('formatDate', () => {
      it('should format date correctly', () => {
        const date = new Date('2024-01-15T10:30:00Z');
        const formatted = formatDate(date);
        assert.ok(formatted.includes('2024'));
      });
    });

    describe('sleep', async () => {
      it('should delay execution', async () => {
        const start = Date.now();
        await sleep(50);
        const elapsed = Date.now() - start;
        assert.ok(elapsed >= 45); // Allow small variance
      });
    });
  });

  describe('String Operations', () => {
    describe('randomId', () => {
      it('should generate unique IDs', () => {
        const id1 = randomId();
        const id2 = randomId();
        assert.notStrictEqual(id1, id2);
      });

      it('should generate ID of specified length', () => {
        const id = randomId(16);
        assert.strictEqual(id.length, 16);
      });
    });
  });

  describe('Object Operations', () => {
    describe('deepClone', () => {
      it('should create a deep copy', () => {
        const original = { a: { b: { c: 1 } } };
        const cloned = deepClone(original);

        cloned.a.b.c = 2;
        assert.strictEqual(original.a.b.c, 1);
      });

      it('should handle arrays', () => {
        const original = { arr: [1, 2, { x: 3 }] };
        const cloned = deepClone(original);

        cloned.arr[2].x = 4;
        assert.strictEqual(original.arr[2].x, 3);
      });
    });

    describe('deepMerge', () => {
      it('should merge objects deeply', () => {
        const obj1 = { a: { x: 1 }, b: 2 };
        const obj2 = { a: { y: 2 }, c: 3 };
        const merged = deepMerge(obj1, obj2);

        assert.deepStrictEqual(merged, {
          a: { x: 1, y: 2 },
          b: 2,
          c: 3,
        });
      });

      it('should override primitive values', () => {
        const obj1 = { a: 1 };
        const obj2 = { a: 2 };
        const merged = deepMerge(obj1, obj2);

        assert.strictEqual(merged.a, 2);
      });
    });
  });

  describe('Validation', () => {
    describe('isValidSymbol', () => {
      it('should validate trading symbols', () => {
        assert.strictEqual(isValidSymbol('BTC/USDT'), true);
        assert.strictEqual(isValidSymbol('ETH/USDT:USDT'), true);
        assert.strictEqual(isValidSymbol(''), false);
        assert.strictEqual(isValidSymbol(null), false);
      });
    });

    describe('isValidSide', () => {
      it('should validate order sides', () => {
        assert.strictEqual(isValidSide('buy'), true);
        assert.strictEqual(isValidSide('sell'), true);
        assert.strictEqual(isValidSide('BUY'), true);
        assert.strictEqual(isValidSide('invalid'), false);
      });
    });

    describe('isValidOrderType', () => {
      it('should validate order types', () => {
        assert.strictEqual(isValidOrderType('limit'), true);
        assert.strictEqual(isValidOrderType('market'), true);
        assert.strictEqual(isValidOrderType('LIMIT'), true);
        assert.strictEqual(isValidOrderType('invalid'), false);
      });
    });

    describe('isPositive', () => {
      it('should check if number is positive', () => {
        assert.strictEqual(isPositive(1), true);
        assert.strictEqual(isPositive(0.001), true);
        assert.strictEqual(isPositive(0), false);
        assert.strictEqual(isPositive(-1), false);
      });
    });
  });
});
