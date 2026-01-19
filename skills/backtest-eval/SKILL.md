---
name: backtest-eval
description: Run, extend, or interpret backtests and evaluation metrics. Use when tuning backtest parameters, adding metrics, or changing historical data evaluation.
---

# Backtest and Evaluation

## Workflow

1. Run backtests via `npm run backtest` or `node src/main.js backtest` and pass CLI options defined in `src/main.js`.
2. Inspect orchestration in `src/main.js` and engine logic in `src/backtest/BacktestEngine.js` and `src/backtest/runner.js`.
3. Track result output locations (`backtest-results/` is the default in `src/main.js`).
4. Update metrics or reporting logic where results are printed in `src/main.js`.
5. Add or update example flows in `examples/runBacktest.js`.

## References

- Read `docs/USER_MANUAL.md` and `docs/DEVELOPMENT.md` for usage patterns.
