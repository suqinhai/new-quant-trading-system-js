/**
 * 通用辅助函数
 * Common Helper Functions
 *
 * 提供常用的工具函数
 * Provides commonly used utility functions
 */

// 导入 Decimal.js / Import Decimal.js
import Decimal from 'decimal.js';

// ============================================
// 数字处理 / Number Handling
// ============================================

/**
 * 安全的数字转换
 * Safe number conversion
 * @param {any} value - 要转换的值 / Value to convert
 * @param {number} defaultValue - 默认值 / Default value
 * @returns {number} 转换后的数字 / Converted number
 */
export function toNumber(value, defaultValue = 0) {
  // 如果已经是数字，直接返回 / If already a number, return directly
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }

  // 尝试转换 / Try to convert
  const num = Number(value);

  // 如果转换失败，返回默认值 / If conversion fails, return default
  return isNaN(num) ? defaultValue : num;
}

/**
 * 高精度加法
 * High precision addition
 * @param {number|string} a - 第一个数 / First number
 * @param {number|string} b - 第二个数 / Second number
 * @returns {number} 结果 / Result
 */
export function add(a, b) {
  return new Decimal(a).plus(b).toNumber();
}

/**
 * 高精度减法
 * High precision subtraction
 * @param {number|string} a - 被减数 / Minuend
 * @param {number|string} b - 减数 / Subtrahend
 * @returns {number} 结果 / Result
 */
export function subtract(a, b) {
  return new Decimal(a).minus(b).toNumber();
}

/**
 * 高精度乘法
 * High precision multiplication
 * @param {number|string} a - 第一个数 / First number
 * @param {number|string} b - 第二个数 / Second number
 * @returns {number} 结果 / Result
 */
export function multiply(a, b) {
  return new Decimal(a).times(b).toNumber();
}

/**
 * 高精度除法
 * High precision division
 * @param {number|string} a - 被除数 / Dividend
 * @param {number|string} b - 除数 / Divisor
 * @returns {number} 结果 / Result
 */
export function divide(a, b) {
  // 防止除以零 / Prevent division by zero
  if (new Decimal(b).isZero()) {
    return 0;
  }
  return new Decimal(a).dividedBy(b).toNumber();
}

/**
 * 四舍五入到指定小数位
 * Round to specified decimal places
 * @param {number|string} value - 要处理的值 / Value to process
 * @param {number} decimals - 小数位数 / Decimal places
 * @returns {number} 结果 / Result
 */
export function round(value, decimals = 2) {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * 向下取整到指定小数位
 * Floor to specified decimal places
 * @param {number|string} value - 要处理的值 / Value to process
 * @param {number} decimals - 小数位数 / Decimal places
 * @returns {number} 结果 / Result
 */
export function floor(value, decimals = 2) {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toNumber();
}

/**
 * 向上取整到指定小数位
 * Ceiling to specified decimal places
 * @param {number|string} value - 要处理的值 / Value to process
 * @param {number} decimals - 小数位数 / Decimal places
 * @returns {number} 结果 / Result
 */
export function ceil(value, decimals = 2) {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_UP).toNumber();
}

/**
 * 计算百分比变化
 * Calculate percentage change
 * @param {number} from - 起始值 / Start value
 * @param {number} to - 结束值 / End value
 * @returns {number} 百分比变化 / Percentage change
 */
export function percentChange(from, to) {
  // 防止除以零 / Prevent division by zero
  if (from === 0) {
    return to === 0 ? 0 : (to > 0 ? 100 : -100);
  }
  return multiply(divide(subtract(to, from), Math.abs(from)), 100);
}

// ============================================
// 数组处理 / Array Handling
// ============================================

/**
 * 计算数组平均值
 * Calculate array average
 * @param {number[]} arr - 数字数组 / Number array
 * @returns {number} 平均值 / Average
 */
export function average(arr) {
  // 空数组返回 0 / Empty array returns 0
  if (!arr || arr.length === 0) {
    return 0;
  }

  // 计算总和 / Calculate sum
  const sum = arr.reduce((acc, val) => add(acc, toNumber(val)), 0);

  // 返回平均值 / Return average
  return divide(sum, arr.length);
}

/**
 * 计算数组标准差
 * Calculate array standard deviation
 * @param {number[]} arr - 数字数组 / Number array
 * @returns {number} 标准差 / Standard deviation
 */
export function standardDeviation(arr) {
  // 空数组或单元素数组返回 0 / Empty or single element array returns 0
  if (!arr || arr.length <= 1) {
    return 0;
  }

  // 计算平均值 / Calculate average
  const avg = average(arr);

  // 计算方差 / Calculate variance
  const squaredDiffs = arr.map(val => {
    const diff = subtract(toNumber(val), avg);
    return multiply(diff, diff);
  });

  // 计算方差平均值 / Calculate variance average
  const variance = average(squaredDiffs);

  // 返回标准差 / Return standard deviation
  return Math.sqrt(variance);
}

/**
 * 获取数组最大值
 * Get array maximum
 * @param {number[]} arr - 数字数组 / Number array
 * @returns {number} 最大值 / Maximum
 */
export function max(arr) {
  if (!arr || arr.length === 0) {
    return 0;
  }
  return Math.max(...arr.map(v => toNumber(v)));
}

/**
 * 获取数组最小值
 * Get array minimum
 * @param {number[]} arr - 数字数组 / Number array
 * @returns {number} 最小值 / Minimum
 */
export function min(arr) {
  if (!arr || arr.length === 0) {
    return 0;
  }
  return Math.min(...arr.map(v => toNumber(v)));
}

/**
 * 数组求和
 * Sum array
 * @param {number[]} arr - 数字数组 / Number array
 * @returns {number} 总和 / Sum
 */
export function sum(arr) {
  if (!arr || arr.length === 0) {
    return 0;
  }
  return arr.reduce((acc, val) => add(acc, toNumber(val)), 0);
}

/**
 * 获取数组最后 N 个元素
 * Get last N elements of array
 * @param {Array} arr - 数组 / Array
 * @param {number} n - 元素数量 / Number of elements
 * @returns {Array} 最后 N 个元素 / Last N elements
 */
export function last(arr, n = 1) {
  if (!arr || arr.length === 0) {
    return n === 1 ? undefined : [];
  }

  if (n === 1) {
    return arr[arr.length - 1];
  }

  return arr.slice(-n);
}

// ============================================
// 时间处理 / Time Handling
// ============================================

/**
 * 格式化日期时间
 * Format date time
 * @param {Date|number|string} date - 日期 / Date
 * @param {string} format - 格式 / Format
 * @returns {string} 格式化后的日期 / Formatted date
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  // 转换为 Date 对象 / Convert to Date object
  const d = date instanceof Date ? date : new Date(date);

  // 检查日期是否有效 / Check if date is valid
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }

  // 格式化组件 / Format components
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');

  // 替换格式字符串 / Replace format string
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
    .replace('SSS', ms);
}

/**
 * 解析时间间隔字符串
 * Parse time interval string
 * @param {string} interval - 间隔字符串 (如 '1m', '5m', '1h', '1d') / Interval string
 * @returns {number} 毫秒数 / Milliseconds
 */
export function parseInterval(interval) {
  // 时间单位映射 / Time unit mapping
  const units = {
    s: 1000,           // 秒 / Seconds
    m: 60 * 1000,      // 分钟 / Minutes
    h: 60 * 60 * 1000, // 小时 / Hours
    d: 24 * 60 * 60 * 1000, // 天 / Days
    w: 7 * 24 * 60 * 60 * 1000, // 周 / Weeks
  };

  // 解析间隔 / Parse interval
  const match = interval.match(/^(\d+)([smhdw])$/);

  if (!match) {
    // 默认返回 1 分钟 / Default to 1 minute
    return 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  return value * (units[unit] || 60 * 1000);
}

/**
 * 延迟执行
 * Delay execution
 * @param {number} ms - 毫秒数 / Milliseconds
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取当前时间戳 (毫秒)
 * Get current timestamp (milliseconds)
 * @returns {number} 时间戳 / Timestamp
 */
export function now() {
  return Date.now();
}

/**
 * 对齐到时间间隔
 * Align to time interval
 * @param {number} timestamp - 时间戳 / Timestamp
 * @param {string} interval - 间隔 / Interval
 * @returns {number} 对齐后的时间戳 / Aligned timestamp
 */
export function alignToInterval(timestamp, interval) {
  const ms = parseInterval(interval);
  return Math.floor(timestamp / ms) * ms;
}

// ============================================
// 字符串处理 / String Handling
// ============================================

/**
 * 生成随机 ID
 * Generate random ID
 * @param {number} length - ID 长度 / ID length
 * @returns {string} 随机 ID / Random ID
 */
export function randomId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 格式化数字为货币
 * Format number as currency
 * @param {number} value - 数值 / Value
 * @param {string} currency - 货币符号 / Currency symbol
 * @param {number} decimals - 小数位 / Decimal places
 * @returns {string} 格式化后的货币 / Formatted currency
 */
export function formatCurrency(value, currency = '$', decimals = 2) {
  const num = toNumber(value);
  const sign = num < 0 ? '-' : '';
  const absValue = Math.abs(num);

  // 格式化数字 / Format number
  const formatted = absValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${sign}${currency}${formatted}`;
}

/**
 * 格式化百分比
 * Format percentage
 * @param {number} value - 数值 / Value
 * @param {number} decimals - 小数位 / Decimal places
 * @returns {string} 格式化后的百分比 / Formatted percentage
 */
export function formatPercent(value, decimals = 2) {
  const num = toNumber(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${round(num, decimals)}%`;
}

// ============================================
// 对象处理 / Object Handling
// ============================================

/**
 * 深拷贝对象
 * Deep clone object
 * @param {Object} obj - 要拷贝的对象 / Object to clone
 * @returns {Object} 拷贝后的对象 / Cloned object
 */
export function deepClone(obj) {
  // 处理 null 和非对象 / Handle null and non-objects
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 处理日期 / Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  // 处理数组 / Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  // 处理普通对象 / Handle plain object
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * 深度合并对象
 * Deep merge objects
 * @param {Object} target - 目标对象 / Target object
 * @param {Object} source - 源对象 / Source object
 * @returns {Object} 合并后的对象 / Merged object
 */
export function deepMerge(target, source) {
  // 创建目标拷贝 / Create target copy
  const result = deepClone(target);

  // 遍历源对象 / Iterate source object
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      // 如果两者都是对象，递归合并 / If both are objects, merge recursively
      if (
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key]) &&
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = deepClone(source[key]);
      }
    }
  }

  return result;
}

/**
 * 安全获取嵌套属性
 * Safely get nested property
 * @param {Object} obj - 对象 / Object
 * @param {string} path - 属性路径 / Property path
 * @param {any} defaultValue - 默认值 / Default value
 * @returns {any} 属性值 / Property value
 */
export function get(obj, path, defaultValue = undefined) {
  // 如果对象为空，返回默认值 / If object is null, return default
  if (!obj) {
    return defaultValue;
  }

  // 分割路径 / Split path
  const keys = path.split('.');

  // 遍历获取属性 / Traverse to get property
  let result = obj;
  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }

  // 返回结果或默认值 / Return result or default
  return result === undefined ? defaultValue : result;
}

// ============================================
// 验证函数 / Validation Functions
// ============================================

/**
 * 检查是否为有效交易对
 * Check if valid trading pair
 * @param {string} symbol - 交易对 / Trading pair
 * @returns {boolean} 是否有效 / Is valid
 */
export function isValidSymbol(symbol) {
  // 基本格式检查 / Basic format check
  if (!symbol || typeof symbol !== 'string') {
    return false;
  }

  // 检查是否包含斜杠 / Check if contains slash
  return symbol.includes('/') && symbol.split('/').length === 2;
}

/**
 * 检查是否为有效订单方向
 * Check if valid order side
 * @param {string} side - 订单方向 / Order side
 * @returns {boolean} 是否有效 / Is valid
 */
export function isValidSide(side) {
  return ['buy', 'sell'].includes(side?.toLowerCase());
}

/**
 * 检查是否为有效订单类型
 * Check if valid order type
 * @param {string} type - 订单类型 / Order type
 * @returns {boolean} 是否有效 / Is valid
 */
export function isValidOrderType(type) {
  return ['market', 'limit', 'stop', 'stop_limit'].includes(type?.toLowerCase());
}

/**
 * 检查是否为正数
 * Check if positive number
 * @param {number} value - 数值 / Value
 * @returns {boolean} 是否为正数 / Is positive
 */
export function isPositive(value) {
  const num = toNumber(value);
  return num > 0;
}

// 默认导出所有函数 / Default export all functions
export default {
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
};
