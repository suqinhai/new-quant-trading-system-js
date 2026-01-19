---
name: strategy-dev
description: Create or modify trading strategies, signals, and registration in the strategy registry. Use when adding a new strategy, tuning parameters, or wiring it into backtest/shadow/live runs.
---

# Strategy Development

## Workflow

1. Start from `src/strategies/BaseStrategy.js` and mirror an existing strategy in `src/strategies/` for structure.
2. Implement lifecycle hooks (`onInit`, `onTick`, `onCandle`, etc.) and emit signals using the BaseStrategy pattern.
3. Register the new strategy in `src/strategies/index.js` so it can be referenced by name.
4. Add configuration defaults in `config/default.js` and any profile bundles in `config/strategies/*.json`.
5. Add or update examples in `examples/` to show usage.
6. Add tests under `tests/unit/` or `tests/integration/` for signal logic and edge cases.

## References

- Read `docs/STRATEGY_DEVELOPMENT.md` for the full lifecycle and registry details.
- Use `docs/CROSS_SECTIONAL_STRATEGIES.md`, `docs/FACTOR_INVESTING.md`, `docs/STATISTICAL_ARBITRAGE.md`, `docs/adaptive-strategy.md`, and `docs/risk-driven-strategy.md` for specialized strategy patterns.
