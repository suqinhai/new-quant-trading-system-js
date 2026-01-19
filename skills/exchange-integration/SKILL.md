---
name: exchange-integration
description: Add or modify exchange adapters, order routing, and market data integration. Use when integrating a new exchange, changing API handling, or updating rate limits.
---

# Exchange Integration

## Workflow

1. Start from `src/exchange/BaseExchange.js` for shared behavior and required interface methods.
2. Add a new adapter in `src/exchange/` and wire it into `src/exchange/ExchangeFactory.js` and `src/exchange/index.js`.
3. Update rate-limit and exchange config in `config/default.js`.
4. Confirm execution paths in `src/executor/orderExecutor.js` and related modules under `src/executor/`.
5. Update `.env.example` if new credentials or endpoints are required.
6. Add integration tests under `tests/integration/` or mocks in `tests/mocks/`.

## References

- Use `docs/API_REFERENCE.md` for API surface expectations.
