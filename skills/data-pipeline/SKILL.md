---
name: data-pipeline
description: Work on market data ingestion, storage, and historical data pipelines. Use when modifying data downloads, streaming, aggregation, or database storage.
---

# Data Pipeline

## Workflow

1. Trace live data flow in `src/marketdata/MarketDataEngine.js` and `src/marketdata/DataAggregator.js`.
2. Review services in `src/services/MarketDataService.js` and `src/services/MarketDataSubscriber.js`.
3. Update storage layers in `src/database/` (ClickHouse and Redis clients).
4. Adjust configs in `config/clickhouse/`, `config/redis-sentinel/`, `config/redis.conf`, and `config/default.js`.
5. Use `scripts/downloadHistoricalData.js` or `scripts/download-history.js` for historical data ingestion.
6. Add tests for data parsing and persistence under `tests/integration/` if behavior changes.

## References

- Use `docs/API_REFERENCE.md` for API endpoints if data is served externally.
