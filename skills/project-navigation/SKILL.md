---
name: project-navigation
description: Navigate this quant trading system repo and quickly locate entrypoints, configs, runtime modes, and core modules. Use when you need to orient yourself, trace execution flow, or find where to edit strategies, risk, data, exchange, or ops files.
---

# Project Navigation

## Quick Map

- Start in `src/main.js` for run modes (backtest/shadow/live), CLI args, and orchestration.
- Use `src/index.js` for library-style entrypoints.
- Edit strategy code in `src/strategies/` and registry wiring in `src/strategies/index.js`.
- Find config in `config/default.js`, `config/index.js`, and `config/strategies/*.json`.
- Work with market data in `src/marketdata/` and `src/services/`.
- Handle execution in `src/executor/` and exchange adapters in `src/exchange/`.
- Review risk and portfolio logic in `src/risk/` and `src/portfolio/`.
- Use `src/backtest/` for backtesting.
- Edit the web UI in `web/`.
- Check scripts in `scripts/` and tests in `tests/`.
- Review ops files in `ecosystem.config.cjs`, `docker-compose.single-strategy.yml`, `docker-compose.multi-strategy.yml`, and `start-all-strategies.sh`.
- Check `package.json` and `.env.example` for runtime scripts and required env vars.
- Read docs in `docs/` (start with `docs/README.md`, `docs/USER_MANUAL.md`, `docs/DEVELOPMENT.md`).
