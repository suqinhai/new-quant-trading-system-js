/**
 * 兼容入口
 * Compatibility entry point
 *
 * 历史上该文件承载过旧版交易引擎实现。
 * 现在统一转发到 src/main.js，避免继续分叉运行时。
 */

import path from 'path';
import { fileURLToPath } from 'url';

import main, {
  TradingSystemRunner,
  RUN_MODE,
  SYSTEM_STATUS,
  parseArgs,
  showHelp,
} from './main.js';

const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

function hasRunModeArg(args = []) {
  return args.some(arg => arg === RUN_MODE.BACKTEST || arg === RUN_MODE.SHADOW || arg === RUN_MODE.LIVE);
}

if (isDirectExecution) {
  if (!hasRunModeArg(process.argv.slice(2))) {
    process.argv.splice(2, 0, RUN_MODE.SHADOW);
    console.warn('[Compat] src/index.js 已废弃，默认以 shadow 模式转发到 src/main.js。请改用 `node src/main.js <mode>`。');
  }

  main();
}

export { TradingSystemRunner, TradingSystemRunner as TradingEngine, RUN_MODE, SYSTEM_STATUS, parseArgs, showHelp };

export default TradingSystemRunner;
