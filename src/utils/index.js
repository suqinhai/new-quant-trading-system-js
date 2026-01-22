/**
 * 工具模块导出文件
 * Utils Module Export File
 *
 * 统一导出所有工具函数
 * Unified export of all utility functions
 */

// 导出日志工具 / Export logger
export { // 导出命名成员
  createLogger, // 执行语句
  logger, // 执行语句
  tradingLogger, // 执行语句
  strategyLogger, // 执行语句
  riskLogger, // 执行语句
  perfLogger, // 执行语句
} from './logger.js'; // 执行语句

// 导出加密工具 / Export crypto utilities
export { // 导出命名成员
  encrypt, // 执行语句
  decrypt, // 执行语句
  encryptKeys, // 执行语句
  decryptKeys, // 执行语句
  saveEncryptedKeys, // 执行语句
  loadEncryptedKeys, // 执行语句
  hasEncryptedKeys, // 执行语句
  getMasterPassword, // 执行语句
  generateMasterPassword, // 执行语句
  validatePasswordStrength, // 执行语句
  encryptValue, // 执行语句
  decryptValue, // 执行语句
  isEncrypted, // 执行语句
  decryptObject, // 执行语句
} from './crypto.js'; // 执行语句

// 导出辅助函数 / Export helpers
export { // 导出命名成员
  // 数字处理 / Number handling
  toNumber, // 执行语句
  add, // 执行语句
  subtract, // 执行语句
  multiply, // 执行语句
  divide, // 执行语句
  round, // 执行语句
  floor, // 执行语句
  ceil, // 执行语句
  percentChange, // 执行语句

  // 数组处理 / Array handling
  average, // 执行语句
  standardDeviation, // 执行语句
  max, // 执行语句
  min, // 执行语句
  sum, // 执行语句
  last, // 执行语句

  // 时间处理 / Time handling
  formatDate, // 执行语句
  parseInterval, // 执行语句
  sleep, // 执行语句
  now, // 执行语句
  alignToInterval, // 执行语句

  // 字符串处理 / String handling
  randomId, // 执行语句
  formatCurrency, // 执行语句
  formatPercent, // 执行语句

  // 对象处理 / Object handling
  deepClone, // 执行语句
  deepMerge, // 执行语句
  get, // 执行语句

  // 验证函数 / Validation
  isValidSymbol, // 执行语句
  isValidSide, // 执行语句
  isValidOrderType, // 执行语句
  isPositive, // 执行语句
} from './helpers.js'; // 执行语句

// 导出技术指标 / Export indicators
export { // 导出命名成员
  // 移动平均线 / Moving averages
  SMA, // 执行语句
  EMA, // 执行语句
  WMA, // 执行语句
  VWMA, // 执行语句

  // 震荡指标 / Oscillators
  RSI, // 执行语句
  Stochastic, // 执行语句
  WilliamsR, // 执行语句
  CCI, // 执行语句

  // 趋势指标 / Trend indicators
  MACD, // 执行语句
  ADX, // 执行语句
  PSAR, // 执行语句

  // 波动率指标 / Volatility indicators
  BollingerBands, // 执行语句
  ATR, // 执行语句
  TrueRange, // 执行语句
  KeltnerChannels, // 执行语句

  // 成交量指标 / Volume indicators
  OBV, // 执行语句
  MFI, // 执行语句
  VROC, // 执行语句

  // 动量指标 / Momentum indicators
  Momentum, // 执行语句
  ROC, // 执行语句

  // 支撑阻力 / Support and resistance
  PivotPoints, // 执行语句
  FibonacciRetracement, // 执行语句

  // 辅助函数 / Helper functions
  getLatest, // 执行语句
  detectCrossover, // 执行语句
} from './indicators.js'; // 执行语句

// 导出验证工具 / Export validators
export { // 导出命名成员
  // 交易参数验证 / Trading parameter validation
  validateOrder, // 执行语句
  validateStrategyConfig, // 执行语句
  validateRiskConfig, // 执行语句

  // 数据验证 / Data validation
  validateCandle, // 执行语句
  validateCandles, // 执行语句

  // 类型验证 / Type validation
  isValidNumber, // 执行语句
  isPositiveNumber, // 执行语句
  isNonNegativeNumber, // 执行语句
  isValidPercentage, // 执行语句
  isValidRatio, // 执行语句
  isNonEmptyString, // 执行语句
  isValidDate, // 执行语句
  isValidEmail, // 执行语句
  isValidUrl, // 执行语句

  // 范围验证 / Range validation
  isInRange, // 执行语句
  clamp, // 执行语句
} from './validators.js'; // 执行语句

// 导入默认导出用于整体导出 / Import default exports for aggregate export
import helpers from './helpers.js'; // 导入模块 ./helpers.js
import indicators from './indicators.js'; // 导入模块 ./indicators.js
import validators from './validators.js'; // 导入模块 ./validators.js
import { logger } from './logger.js'; // 导入模块 ./logger.js
import crypto from './crypto.js'; // 导入模块 ./crypto.js

// 默认导出工具集合 / Default export utility collection
export default { // 默认导出
  helpers, // 执行语句
  indicators, // 执行语句
  validators, // 执行语句
  logger, // 执行语句
  crypto, // 执行语句
}; // 结束代码块
