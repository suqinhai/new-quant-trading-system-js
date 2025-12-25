/**
 * SlippageAnalyzer 滑点分析器测试
 * Slippage Analyzer Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlippageAnalyzer,
  SLIPPAGE_RISK,
  PERIOD_TYPE,
  KNOWN_HIGH_RISK_PERIODS,
  DEFAULT_CONFIG,
} from '../../../src/executor/executionAlpha/SlippageAnalyzer.js';

describe('SlippageAnalyzer 常量导出', () => {
  it('应该导出 SLIPPAGE_RISK', () => {
    expect(SLIPPAGE_RISK.VERY_LOW).toBe('very_low');
    expect(SLIPPAGE_RISK.LOW).toBe('low');
    expect(SLIPPAGE_RISK.MEDIUM).toBe('medium');
    expect(SLIPPAGE_RISK.HIGH).toBe('high');
    expect(SLIPPAGE_RISK.VERY_HIGH).toBe('very_high');
    expect(SLIPPAGE_RISK.EXTREME).toBe('extreme');
  });

  it('应该导出 PERIOD_TYPE', () => {
    expect(PERIOD_TYPE.NORMAL).toBe('normal');
    expect(PERIOD_TYPE.HIGH_VOLATILITY).toBe('high_vol');
    expect(PERIOD_TYPE.LOW_LIQUIDITY).toBe('low_liq');
    expect(PERIOD_TYPE.NEWS_EVENT).toBe('news');
    expect(PERIOD_TYPE.MARKET_OPEN).toBe('market_open');
    expect(PERIOD_TYPE.MARKET_CLOSE).toBe('market_close');
    expect(PERIOD_TYPE.FUNDING_RATE).toBe('funding');
  });

  it('应该导出 KNOWN_HIGH_RISK_PERIODS', () => {
    expect(KNOWN_HIGH_RISK_PERIODS.FUNDING_RATE_TIMES).toBeDefined();
    expect(Array.isArray(KNOWN_HIGH_RISK_PERIODS.FUNDING_RATE_TIMES)).toBe(true);
    expect(KNOWN_HIGH_RISK_PERIODS.FUNDING_RISK_WINDOW).toBeDefined();
    expect(KNOWN_HIGH_RISK_PERIODS.MARKET_OPENS).toBeDefined();
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.slippageThresholds).toBeDefined();
    expect(DEFAULT_CONFIG.historyRetentionHours).toBeDefined();
    expect(DEFAULT_CONFIG.enableAutoDelay).toBeDefined();
  });
});

describe('SlippageAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new SlippageAnalyzer({
      verbose: false,
      warningInterval: 0, // 禁用警告冷却以便测试
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(analyzer.slippageHistory).toBeInstanceOf(Map);
      expect(analyzer.periodStats).toBeInstanceOf(Map);
      expect(analyzer.realtimeMonitor).toBeInstanceOf(Map);
      expect(analyzer.globalStats.totalRecords).toBe(0);
    });

    it('应该合并自定义配置', () => {
      const customAnalyzer = new SlippageAnalyzer({
        historyRetentionHours: 48,
        verbose: false,
      });
      expect(customAnalyzer.config.historyRetentionHours).toBe(48);
    });
  });

  describe('recordSlippage', () => {
    it('应该记录滑点数据', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
        expectedPrice: 100,
        actualPrice: 100.1,
      });

      const history = analyzer.slippageHistory.get('BTC/USDT');
      expect(history).toBeDefined();
      expect(history.length).toBe(1);
    });

    it('应该触发 slippageRecorded 事件', () => {
      const eventSpy = vi.fn();
      analyzer.on('slippageRecorded', eventSpy);

      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该更新全局统计', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      expect(analyzer.globalStats.totalRecords).toBe(1);
      expect(analyzer.globalStats.avgSlippage).toBe(0.001);
      expect(analyzer.globalStats.maxSlippage).toBe(0.001);
    });

    it('应该更新时段统计', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      const periodStats = analyzer.periodStats.get('BTC/USDT');
      expect(periodStats).toBeDefined();
      expect(periodStats.size).toBeGreaterThan(0);
    });

    it('应该更新实时监控', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      const monitor = analyzer.realtimeMonitor.get('BTC/USDT');
      expect(monitor).toBeDefined();
      expect(monitor.recentSlippages.length).toBe(1);
    });

    it('应该在高滑点时触发警告事件', () => {
      const eventSpy = vi.fn();
      analyzer.on('slippageWarning', eventSpy);

      // 记录高滑点
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.02, // 2% - 极端滑点
        side: 'buy',
        size: 10,
      });

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getCurrentRisk', () => {
    it('应该返回当前风险评估', () => {
      const risk = analyzer.getCurrentRisk('BTC/USDT');

      expect(risk.symbol).toBe('BTC/USDT');
      expect(risk.timestamp).toBeDefined();
      expect(risk.riskLevel).toBeDefined();
      expect(risk.riskScore).toBeDefined();
      expect(risk.recommendation).toBeDefined();
    });

    it('应该基于历史数据评估风险', () => {
      // 记录多个滑点数据
      for (let i = 0; i < 15; i++) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: 0.005, // 0.5%
          side: 'buy',
          size: 10,
        });
      }

      const risk = analyzer.getCurrentRisk('BTC/USDT');

      expect(risk.riskFactors.length).toBeGreaterThan(0);
    });

    it('应该检查已知高风险时段', () => {
      const risk = analyzer.getCurrentRisk('BTC/USDT');

      expect(risk.knownRisks).toBeDefined();
      expect(Array.isArray(risk.knownRisks)).toBe(true);
    });
  });

  describe('shouldDelayExecution', () => {
    it('应该返回延迟建议', () => {
      const result = analyzer.shouldDelayExecution('BTC/USDT', 100);

      expect(result.shouldDelay).toBeDefined();
      expect(result.risk).toBeDefined();
    });

    it('应该在禁用自动延迟时返回不延迟', () => {
      analyzer.config.enableAutoDelay = false;

      const result = analyzer.shouldDelayExecution('BTC/USDT', 100);

      expect(result.shouldDelay).toBe(false);
    });

    it('应该在极端风险时建议延迟', () => {
      // 模拟极端风险
      for (let i = 0; i < 10; i++) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: 0.03, // 3%
          side: 'buy',
          size: 10,
        });
      }

      const result = analyzer.shouldDelayExecution('BTC/USDT', 100);

      // 如果风险足够高，应该建议延迟
      if (result.risk.riskLevel === SLIPPAGE_RISK.EXTREME ||
          result.risk.riskLevel === SLIPPAGE_RISK.VERY_HIGH) {
        expect(result.shouldDelay).toBe(true);
        expect(result.delayMs).toBeGreaterThan(0);
      }
    });
  });

  describe('getOptimalExecutionTime', () => {
    it('应该返回最优执行时间', () => {
      const result = analyzer.getOptimalExecutionTime('BTC/USDT');

      expect(result.symbol).toBe('BTC/USDT');
      expect(result.optimalTime).toBeDefined();
      expect(result.optimalScore).toBeDefined();
    });

    it('应该返回替代时间选项', () => {
      const result = analyzer.getOptimalExecutionTime('BTC/USDT', {
        withinHours: 2,
      });

      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    it('应该避开已知高风险时段', () => {
      const result = analyzer.getOptimalExecutionTime('BTC/USDT', {
        withinHours: 1,
        avoidKnownRisks: true,
      });

      expect(result.analysis.avoidedKnownRisks).toBe(true);
    });
  });

  describe('getPeriodHeatmap', () => {
    it('应该在无数据时返回 hasData: false', () => {
      const heatmap = analyzer.getPeriodHeatmap('UNKNOWN/USDT');

      expect(heatmap.hasData).toBe(false);
    });

    it('应该返回热力图数据', () => {
      // 添加数据
      for (let i = 0; i < 20; i++) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: 0.001 + Math.random() * 0.005,
          side: 'buy',
          size: 10,
        });
      }

      const heatmap = analyzer.getPeriodHeatmap('BTC/USDT');

      expect(heatmap.hasData).toBe(true);
      expect(heatmap.heatmap).toBeDefined();
      expect(heatmap.heatmap.length).toBe(24); // 24 小时
      expect(heatmap.summary).toBeDefined();
    });

    it('应该识别高风险时段', () => {
      // 添加高滑点数据
      for (let i = 0; i < 20; i++) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: 0.01, // 1% - 高滑点
          side: 'buy',
          size: 10,
        });
      }

      const heatmap = analyzer.getPeriodHeatmap('BTC/USDT');

      expect(heatmap.highRiskPeriods).toBeDefined();
      expect(Array.isArray(heatmap.highRiskPeriods)).toBe(true);
    });
  });

  describe('_checkKnownHighRiskPeriods', () => {
    it('应该检测资金费率结算时段', () => {
      // 测试 00:00 UTC（资金费率结算时间）
      const risks = analyzer._checkKnownHighRiskPeriods(0, 5);

      const fundingRisk = risks.find(r => r.type === PERIOD_TYPE.FUNDING_RATE);
      expect(fundingRisk).toBeDefined();
    });

    it('应该检测市场开盘时段', () => {
      // 测试欧洲市场开盘时间 07:00 UTC
      const risks = analyzer._checkKnownHighRiskPeriods(7, 5);

      const marketOpenRisk = risks.find(r => r.type === PERIOD_TYPE.MARKET_OPEN);
      expect(marketOpenRisk).toBeDefined();
    });
  });

  describe('_getPeriodKey', () => {
    it('应该生成正确的时段键', () => {
      const key = analyzer._getPeriodKey(14, 30);
      expect(key).toBe('14:30');
    });

    it('应该按时间粒度归类', () => {
      // 默认粒度是 15 分钟
      const key1 = analyzer._getPeriodKey(14, 0);
      const key2 = analyzer._getPeriodKey(14, 14);

      expect(key1).toBe('14:00');
      expect(key2).toBe('14:00');
    });
  });

  describe('_slippageToScore', () => {
    it('应该将低滑点转换为低分数', () => {
      const score = analyzer._slippageToScore(0.0003);
      expect(score).toBeLessThanOrEqual(20);
    });

    it('应该将高滑点转换为高分数', () => {
      const score = analyzer._slippageToScore(0.02);
      expect(score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('_scoreToRiskLevel', () => {
    it('应该将低分数转换为低风险', () => {
      const level = analyzer._scoreToRiskLevel(10);
      expect(level).toBe(SLIPPAGE_RISK.VERY_LOW);
    });

    it('应该将高分数转换为高风险', () => {
      const level = analyzer._scoreToRiskLevel(90);
      expect(level).toBe(SLIPPAGE_RISK.EXTREME);
    });

    it('应该将中等分数转换为中等风险', () => {
      const level = analyzer._scoreToRiskLevel(45);
      expect(level).toBe(SLIPPAGE_RISK.MEDIUM);
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      const stats = analyzer.getStats();

      expect(stats.totalRecords).toBe(1);
      expect(stats.symbolsTracked).toBe(1);
    });
  });

  describe('getTrackedSymbols', () => {
    it('应该返回追踪的交易对', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      analyzer.recordSlippage({
        symbol: 'ETH/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      const symbols = analyzer.getTrackedSymbols();

      expect(symbols).toContain('BTC/USDT');
      expect(symbols).toContain('ETH/USDT');
    });
  });

  describe('resetStats', () => {
    it('应该重置所有统计', () => {
      analyzer.recordSlippage({
        symbol: 'BTC/USDT',
        slippage: 0.001,
        side: 'buy',
        size: 10,
      });

      analyzer.resetStats();

      expect(analyzer.slippageHistory.size).toBe(0);
      expect(analyzer.periodStats.size).toBe(0);
      expect(analyzer.globalStats.totalRecords).toBe(0);
    });
  });

  describe('趋势分析', () => {
    it('应该检测增加趋势', () => {
      // 记录逐渐增加的滑点
      for (let i = 0; i < 15; i++) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: 0.001 + i * 0.001,
          side: 'buy',
          size: 10,
        });
      }

      const monitor = analyzer.realtimeMonitor.get('BTC/USDT');
      expect(monitor.trend).toBe('increasing');
    });

    it('应该检测减少趋势', () => {
      // 记录逐渐减少的滑点
      for (let i = 15; i > 0; i--) {
        analyzer.recordSlippage({
          symbol: 'BTC/USDT',
          slippage: i * 0.001,
          side: 'buy',
          size: 10,
        });
      }

      const monitor = analyzer.realtimeMonitor.get('BTC/USDT');
      expect(monitor.trend).toBe('decreasing');
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      analyzer.config.verbose = true;

      analyzer.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      analyzer.config.verbose = false;

      analyzer.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof analyzer.on).toBe('function');
      expect(typeof analyzer.emit).toBe('function');
      expect(typeof analyzer.removeListener).toBe('function');
    });
  });
});
