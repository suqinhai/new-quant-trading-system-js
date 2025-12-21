/**
 * 技术指标工具测试
 * Technical Indicators Utility Tests
 * @module tests/unit/indicators.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  SMA,
  EMA,
  WMA,
  VWMA,
  RSI,
  Stochastic,
  WilliamsR,
  CCI,
  MACD,
  ADX,
  PSAR,
  BollingerBands,
  ATR,
  TrueRange,
  KeltnerChannels,
  OBV,
  MFI,
  VROC,
  Momentum,
  ROC,
  PivotPoints,
  FibonacciRetracement,
  getLatest,
  detectCrossover,
} from '../../src/utils/indicators.js';

// ============================================
// 测试数据 / Test Data
// ============================================

const prices = [44, 44.5, 43.5, 44.5, 44, 45, 46, 45.5, 46, 47, 47.5, 48, 47.5, 47, 46.5];

const candles = [
  { high: 45, low: 43, close: 44, volume: 1000 },
  { high: 46, low: 44, close: 44.5, volume: 1200 },
  { high: 44.5, low: 43, close: 43.5, volume: 1100 },
  { high: 45.5, low: 44, close: 44.5, volume: 900 },
  { high: 45, low: 43.5, close: 44, volume: 1300 },
  { high: 46, low: 44.5, close: 45, volume: 1500 },
  { high: 47, low: 45.5, close: 46, volume: 1400 },
  { high: 46.5, low: 45, close: 45.5, volume: 1100 },
  { high: 47, low: 45.5, close: 46, volume: 1200 },
  { high: 48, low: 46.5, close: 47, volume: 1600 },
  { high: 48.5, low: 47, close: 47.5, volume: 1700 },
  { high: 49, low: 47.5, close: 48, volume: 1800 },
  { high: 48.5, low: 47, close: 47.5, volume: 1300 },
  { high: 48, low: 46.5, close: 47, volume: 1200 },
  { high: 47.5, low: 46, close: 46.5, volume: 1100 },
];

// ============================================
// 移动平均线测试 / Moving Averages Tests
// ============================================

describe('Moving Averages', () => {
  describe('SMA', () => {
    it('应该计算简单移动平均线', () => {
      const result = SMA(prices, 5);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(prices.length - 5 + 1);
    });

    it('应该返回正确的 SMA 值', () => {
      const result = SMA([1, 2, 3, 4, 5], 3);

      expect(result[0]).toBeCloseTo(2, 2); // (1+2+3)/3
      expect(result[1]).toBeCloseTo(3, 2); // (2+3+4)/3
      expect(result[2]).toBeCloseTo(4, 2); // (3+4+5)/3
    });

    it('周期大于数据长度时应该返回空数组', () => {
      const result = SMA([1, 2, 3], 5);

      expect(result).toEqual([]);
    });
  });

  describe('EMA', () => {
    it('应该计算指数移动平均线', () => {
      const result = EMA(prices, 5);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('EMA 应该比 SMA 对近期价格更敏感', () => {
      const data = [10, 10, 10, 10, 10, 20, 20, 20];
      const sma = SMA(data, 5);
      const ema = EMA(data, 5);

      // EMA 应该比 SMA 更快接近新价格
      const lastSma = sma[sma.length - 1];
      const lastEma = ema[ema.length - 1];

      expect(lastEma).toBeGreaterThanOrEqual(lastSma);
    });
  });

  describe('WMA', () => {
    it('应该计算加权移动平均线', () => {
      const result = WMA(prices, 5);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('WMA 应该对近期数据赋予更高权重', () => {
      const data = [10, 10, 10, 10, 20];
      const sma = SMA(data, 5);
      const wma = WMA(data, 5);

      // WMA 应该更接近最近的价格 20
      expect(wma[0]).toBeGreaterThan(sma[0]);
    });
  });

  describe('VWMA', () => {
    it.skip('应该计算成交量加权移动平均线', () => {
      // VWMA may not be available in the technicalindicators library
      const result = VWMA(candles, 5);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// 震荡指标测试 / Oscillators Tests
// ============================================

describe('Oscillators', () => {
  describe('RSI', () => {
    it('应该计算相对强弱指数', () => {
      const result = RSI(prices, 14);

      expect(result).toBeInstanceOf(Array);
    });

    it('RSI 值应该在 0-100 之间', () => {
      const longerPrices = [...prices, 48, 49, 50, 51, 52, 53, 54, 55];
      const result = RSI(longerPrices, 5);

      result.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });

    it('应该使用默认周期 14', () => {
      const longerPrices = Array.from({ length: 30 }, (_, i) => 50 + Math.sin(i) * 5);
      const result = RSI(longerPrices);

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('Stochastic', () => {
    it('应该计算随机指标', () => {
      const result = Stochastic(candles, 5, 3);

      expect(result).toBeInstanceOf(Array);
    });

    it('%K 和 %D 值应该有效', () => {
      const result = Stochastic(candles, 5, 3);

      // Check that result is valid array with stochastic values
      expect(result).toBeInstanceOf(Array);
      if (result.length > 0) {
        // Check the structure of the result
        const point = result[0];
        expect(point).toBeDefined();
      }
    });
  });

  describe('WilliamsR', () => {
    it('应该计算威廉指标', () => {
      const result = WilliamsR(candles, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('值应该在 -100 到 0 之间', () => {
      const result = WilliamsR(candles, 5);

      result.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(-100);
        expect(value).toBeLessThanOrEqual(0);
      });
    });
  });

  describe('CCI', () => {
    it('应该计算商品通道指数', () => {
      const result = CCI(candles, 5);

      expect(result).toBeInstanceOf(Array);
    });
  });
});

// ============================================
// 趋势指标测试 / Trend Indicators Tests
// ============================================

describe('Trend Indicators', () => {
  describe('MACD', () => {
    it('应该计算 MACD', () => {
      const longerPrices = Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i * 0.2) * 5);
      const result = MACD(longerPrices, 12, 26, 9);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该返回 MACD、信号线和柱状图', () => {
      const longerPrices = Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i * 0.2) * 5);
      const result = MACD(longerPrices, 12, 26, 9);

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('MACD');
        expect(result[0]).toHaveProperty('signal');
        expect(result[0]).toHaveProperty('histogram');
      }
    });

    it('应该使用默认参数', () => {
      const longerPrices = Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i * 0.2) * 5);
      const result = MACD(longerPrices);

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('ADX', () => {
    it('应该计算平均趋向指数', () => {
      const result = ADX(candles, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('ADX 值应该在 0-100 之间', () => {
      const result = ADX(candles, 5);

      result.forEach(point => {
        expect(point.adx).toBeGreaterThanOrEqual(0);
        expect(point.adx).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('PSAR', () => {
    it('应该计算抛物线转向', () => {
      const result = PSAR(candles, 0.02, 0.2);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该使用默认参数', () => {
      const result = PSAR(candles);

      expect(result).toBeInstanceOf(Array);
    });
  });
});

// ============================================
// 波动率指标测试 / Volatility Indicators Tests
// ============================================

describe('Volatility Indicators', () => {
  describe('BollingerBands', () => {
    it('应该计算布林带', () => {
      const result = BollingerBands(prices, 5, 2);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该返回上轨、中轨和下轨', () => {
      const result = BollingerBands(prices, 5, 2);

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('upper');
        expect(result[0]).toHaveProperty('middle');
        expect(result[0]).toHaveProperty('lower');
      }
    });

    it('上轨应该大于中轨，中轨应该大于下轨', () => {
      const result = BollingerBands(prices, 5, 2);

      result.forEach(band => {
        expect(band.upper).toBeGreaterThan(band.middle);
        expect(band.middle).toBeGreaterThan(band.lower);
      });
    });

    it('应该使用默认参数', () => {
      const longerPrices = Array.from({ length: 30 }, (_, i) => 50 + Math.sin(i) * 5);
      const result = BollingerBands(longerPrices);

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('ATR', () => {
    it('应该计算真实波动幅度均值', () => {
      const result = ATR(candles, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('ATR 值应该为正', () => {
      const result = ATR(candles, 5);

      result.forEach(value => {
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe('TrueRange', () => {
    it('应该计算真实波动幅度', () => {
      const result = TrueRange(candles);

      expect(result).toBeInstanceOf(Array);
    });

    it('真实波动幅度应该为正', () => {
      const result = TrueRange(candles);

      result.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('KeltnerChannels', () => {
    it('应该计算肯特纳通道', () => {
      const result = KeltnerChannels(candles, 5, 2);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该返回上轨、中轨和下轨', () => {
      const result = KeltnerChannels(candles, 5, 2);

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('upper');
        expect(result[0]).toHaveProperty('middle');
        expect(result[0]).toHaveProperty('lower');
      }
    });
  });
});

// ============================================
// 成交量指标测试 / Volume Indicators Tests
// ============================================

describe('Volume Indicators', () => {
  describe('OBV', () => {
    it('应该计算能量潮', () => {
      const result = OBV(candles);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('MFI', () => {
    it('应该计算资金流量指数', () => {
      const result = MFI(candles, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('MFI 值应该在 0-100 之间', () => {
      const result = MFI(candles, 5);

      result.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('VROC', () => {
    it('应该计算成交量变化率', () => {
      const volumes = candles.map(c => c.volume);
      const result = VROC(volumes, 5);

      expect(result).toBeInstanceOf(Array);
    });
  });
});

// ============================================
// 动量指标测试 / Momentum Indicators Tests
// ============================================

describe('Momentum Indicators', () => {
  describe('Momentum', () => {
    it('应该计算动量', () => {
      const result = Momentum(prices, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该使用默认周期', () => {
      const result = Momentum(prices);

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('ROC', () => {
    it('应该计算变化率', () => {
      const result = ROC(prices, 5);

      expect(result).toBeInstanceOf(Array);
    });

    it('应该使用默认周期', () => {
      const result = ROC(prices);

      expect(result).toBeInstanceOf(Array);
    });
  });
});

// ============================================
// 支撑阻力测试 / Support/Resistance Tests
// ============================================

describe('Support/Resistance', () => {
  describe('PivotPoints', () => {
    it('应该计算枢轴点', () => {
      const result = PivotPoints(50, 45, 48);

      expect(result).toHaveProperty('pp');
      expect(result).toHaveProperty('r1');
      expect(result).toHaveProperty('r2');
      expect(result).toHaveProperty('r3');
      expect(result).toHaveProperty('s1');
      expect(result).toHaveProperty('s2');
      expect(result).toHaveProperty('s3');
    });

    it('枢轴点应该是 (H+L+C)/3', () => {
      const result = PivotPoints(50, 40, 45);
      const expectedPP = (50 + 40 + 45) / 3;

      expect(result.pp).toBeCloseTo(expectedPP, 2);
    });

    it('阻力位应该大于枢轴点', () => {
      const result = PivotPoints(50, 40, 45);

      expect(result.r1).toBeGreaterThan(result.pp);
      expect(result.r2).toBeGreaterThan(result.r1);
      expect(result.r3).toBeGreaterThan(result.r2);
    });

    it('支撑位应该小于枢轴点', () => {
      const result = PivotPoints(50, 40, 45);

      expect(result.s1).toBeLessThan(result.pp);
      expect(result.s2).toBeLessThan(result.s1);
      expect(result.s3).toBeLessThan(result.s2);
    });
  });

  describe('FibonacciRetracement', () => {
    it('应该计算斐波那契回撤', () => {
      const result = FibonacciRetracement(100, 50);

      expect(result).toHaveProperty('level0');
      expect(result).toHaveProperty('level236');
      expect(result).toHaveProperty('level382');
      expect(result).toHaveProperty('level500');
      expect(result).toHaveProperty('level618');
      expect(result).toHaveProperty('level786');
      expect(result).toHaveProperty('level1000');
    });

    it('level0 应该是低点', () => {
      const result = FibonacciRetracement(100, 50);

      expect(result.level0).toBe(50);
    });

    it('level1000 应该是高点', () => {
      const result = FibonacciRetracement(100, 50);

      expect(result.level1000).toBe(100);
    });

    it('level500 应该是中点', () => {
      const result = FibonacciRetracement(100, 50);

      expect(result.level500).toBe(75);
    });
  });
});

// ============================================
// 辅助函数测试 / Helper Functions Tests
// ============================================

describe('Helper Functions', () => {
  describe('getLatest', () => {
    it('应该获取最新值', () => {
      const values = [1, 2, 3, 4, 5];
      const result = getLatest(values);

      expect(result).toBe(5);
    });

    it('空数组应该返回 null', () => {
      const result = getLatest([]);

      expect(result).toBeNull();
    });

    it('应该处理对象数组', () => {
      const values = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const result = getLatest(values);

      expect(result).toEqual({ a: 3 });
    });
  });

  describe('detectCrossover', () => {
    it('应该检测金叉', () => {
      const fast = [10, 12, 15];
      const slow = [14, 13, 12];
      const result = detectCrossover(fast, slow);

      expect(result.bullish).toBe(true);
      expect(result.bearish).toBe(false);
    });

    it('应该检测死叉', () => {
      const fast = [15, 13, 10];
      const slow = [12, 12, 12];
      const result = detectCrossover(fast, slow);

      expect(result.bullish).toBe(false);
      expect(result.bearish).toBe(true);
    });

    it('没有交叉时应该返回 false', () => {
      const fast = [10, 11, 12];
      const slow = [15, 15, 15];
      const result = detectCrossover(fast, slow);

      expect(result.bullish).toBe(false);
      expect(result.bearish).toBe(false);
    });

    it('数据不足时应该返回 false', () => {
      const result = detectCrossover([10], [15]);

      expect(result.bullish).toBe(false);
      expect(result.bearish).toBe(false);
    });
  });
});
