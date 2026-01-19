---
name: indicator-lib
description: Extend or optimize technical indicator calculations and related utilities. Use when adding new indicators, adjusting math, or improving performance or numeric stability.
---

# Indicator Library

## Workflow

1. Add or update indicator functions in `src/utils/indicators.js`.
2. Reuse helpers from `src/utils/helpers.js` (for example `toNumber`, `average`, and `standardDeviation`) to normalize inputs.
3. Keep functions pure and return arrays aligned to input length when possible.
4. Update consuming strategies in `src/strategies/` to use the new indicator output.
5. Add unit tests in `tests/unit/` that cover edge cases (short arrays, NaN inputs, empty inputs).

## References

- Use `technicalindicators` APIs already imported in `src/utils/indicators.js`.
