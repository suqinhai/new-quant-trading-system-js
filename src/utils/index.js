/**
 * 工具模块导出文件
 * Utils Module Export File
 *
 * 统一导出所有工具函数
 * Unified export of all utility functions
 */

// 导出日志工具 / Export logger
export {
  createLogger,
  logger,
  tradingLogger,
  strategyLogger,
  riskLogger,
  perfLogger,
} from './logger.js';

// 导出加密工具 / Export crypto utilities
export {
  encrypt,
  decrypt,
  encryptKeys,
  decryptKeys,
  saveEncryptedKeys,
  loadEncryptedKeys,
  hasEncryptedKeys,
  getMasterPassword,
  generateMasterPassword,
  validatePasswordStrength,
  encryptValue,
  decryptValue,
  isEncrypted,
  decryptObject,
} from './crypto.js';

// 导出辅助函数 / Export helpers
export {
  // 数字处理 / Number handling
  toNumber,
  add,
  subtract,
  multiply,
  divide,
  round,
  floor,
  ceil,
  percentChange,

  // 数组处理 / Array handling
  average,
  standardDeviation,
  max,
  min,
  sum,
  last,

  // 时间处理 / Time handling
  formatDate,
  parseInterval,
  sleep,
  now,
  alignToInterval,

  // 字符串处理 / String handling
  randomId,
  formatCurrency,
  formatPercent,

  // 对象处理 / Object handling
  deepClone,
  deepMerge,
  get,

  // 验证函数 / Validation
  isValidSymbol,
  isValidSide,
  isValidOrderType,
  isPositive,
} from './helpers.js';

// 导出技术指标 / Export indicators
export {
  // 移动平均线 / Moving averages
  SMA,
  EMA,
  WMA,
  VWMA,

  // 震荡指标 / Oscillators
  RSI,
  Stochastic,
  WilliamsR,
  CCI,

  // 趋势指标 / Trend indicators
  MACD,
  ADX,
  PSAR,

  // 波动率指标 / Volatility indicators
  BollingerBands,
  ATR,
  TrueRange,
  KeltnerChannels,

  // 成交量指标 / Volume indicators
  OBV,
  MFI,
  VROC,

  // 动量指标 / Momentum indicators
  Momentum,
  ROC,

  // 支撑阻力 / Support and resistance
  PivotPoints,
  FibonacciRetracement,

  // 辅助函数 / Helper functions
  getLatest,
  detectCrossover,
} from './indicators.js';

// 导出验证工具 / Export validators
export {
  // 交易参数验证 / Trading parameter validation
  validateOrder,
  validateStrategyConfig,
  validateRiskConfig,

  // 数据验证 / Data validation
  validateCandle,
  validateCandles,

  // 类型验证 / Type validation
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPercentage,
  isValidRatio,
  isNonEmptyString,
  isValidDate,
  isValidEmail,
  isValidUrl,

  // 范围验证 / Range validation
  isInRange,
  clamp,
} from './validators.js';

// 导入默认导出用于整体导出 / Import default exports for aggregate export
import helpers from './helpers.js';
import indicators from './indicators.js';
import validators from './validators.js';
import { logger } from './logger.js';
import crypto from './crypto.js';

// 默认导出工具集合 / Default export utility collection
export default {
  helpers,
  indicators,
  validators,
  logger,
  crypto,
};
