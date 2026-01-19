---
name: risk-controls
description: Implement or modify risk management, position sizing, stop loss, and circuit breaker logic. Use when changing risk rules, drawdown limits, or portfolio risk behavior.
---

# Risk Controls

## Workflow

1. Review risk modules in `src/risk/` (for example `RiskManager.js`, `CircuitBreaker.js`, `PortfolioRiskManager.js`).
2. Update global or strategy-specific risk configuration in `config/default.js`.
3. If risk logic affects allocation, coordinate changes with `src/portfolio/PortfolioManager.js`.
4. Validate live and shadow behavior in `src/main.js` where risk is initialized.
5. Add tests in `tests/unit/` or `tests/integration/` for stop loss, drawdown, and circuit-breaker triggers.

## References

- Use `docs/risk-driven-strategy.md` for the risk-driven strategy design.
