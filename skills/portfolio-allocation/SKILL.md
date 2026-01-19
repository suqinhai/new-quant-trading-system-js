---
name: portfolio-allocation
description: Implement portfolio allocation, strategy weighting, and multi-strategy combination logic. Use when modifying WeightedCombo, signal weighting, or portfolio risk and rebalancing.
---

# Portfolio Allocation

## Workflow

1. Review portfolio orchestration in `src/portfolio/PortfolioManager.js`.
2. For weighted combos, update `src/strategies/WeightedComboStrategy.js` and `src/strategies/SignalWeightingSystem.js`.
3. Use correlation analysis in `src/analytics/CorrelationAnalyzer.js` when adjusting diversification logic.
4. Update configuration in `config/default.js` (weighted combo and allocation parameters).
5. Validate behavior using `examples/runWeightedCombo.js`.
6. Add tests in `tests/unit/` for weighting logic and edge conditions.

## References

- Read `docs/EXECUTION_ALPHA.md` if allocation changes affect execution quality.
