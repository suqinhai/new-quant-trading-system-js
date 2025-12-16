# ClickHouse Quick Start Guide
# ClickHouse 快速开始指南

## One-Minute Setup

### 1. Verify ClickHouse is Running
```bash
docker ps | grep clickhouse
# Should show: clickhouse/clickhouse-server running on port 8123
```

### 2. Check .env Configuration
```bash
cat .env | grep CLICKHOUSE
# Should show all ClickHouse settings
```

### 3. Download Data
```bash
npm run download-history
# Downloads all available data from all exchanges
```

### 4. Verify Data
```bash
docker exec clickhouse clickhouse-client -q "SELECT COUNT(*) FROM ohlcv_binance"
# Should show record count (e.g., 2000)
```

---

## Common Commands

### Download Specific Symbol
```bash
npm run download-history -- -s BTC/USDT:USDT,ETH/USDT:USDT
```

### Download with Date Range
```bash
npm run download-history -- --start 2024-01-01 --end 2024-12-31
```

### Download Specific Data Type
```bash
npm run download-history -- -t ohlcv
npm run download-history -- -t funding_rate
npm run download-history -- -t open_interest
```

### Download from Specific Exchange
```bash
npm run download-history -- -e binance
npm run download-history -- -e bybit
npm run download-history -- -e okx
```

### Combine Options
```bash
npm run download-history -- -e binance -t ohlcv -s BTC/USDT:USDT --start 2024-12-01 --end 2024-12-02
```

---

## Query Data

### Count Total Records
```bash
docker exec clickhouse clickhouse-client -q "SELECT COUNT(*) FROM ohlcv_binance"
```

### View Latest Data
```bash
docker exec clickhouse clickhouse-client -q "SELECT symbol, timestamp, open, close FROM ohlcv_binance ORDER BY timestamp DESC LIMIT 5"
```

### Get Price Statistics
```bash
docker exec clickhouse clickhouse-client -q "SELECT symbol, MIN(close) min_price, MAX(close) max_price, AVG(close) avg_price FROM ohlcv_binance GROUP BY symbol"
```

### Time Range of Data
```bash
docker exec clickhouse clickhouse-client -q "SELECT symbol, MIN(timestamp) start, MAX(timestamp) end FROM ohlcv_binance GROUP BY symbol"
```

---

## Troubleshooting

### ClickHouse Not Running
```bash
docker run -d --name clickhouse -p 8123:8123 -p 9000:9000 \
  -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 \
  clickhouse/clickhouse-server
```

### Connection Refused
```bash
# Check if service is up
curl http://localhost:8123/ping
# Should return: Ok.
```

### Clear All Data
```bash
docker exec clickhouse clickhouse-client -q "DROP TABLE IF EXISTS ohlcv_binance; DROP TABLE IF EXISTS funding_rate_binance; DROP TABLE IF EXISTS open_interest_binance; DROP TABLE IF EXISTS mark_price_binance"
```

### Check Service Logs
```bash
docker logs clickhouse | tail -50
```

---

## Environment Configuration (.env)

```ini
CLICKHOUSE_HOST=localhost        # Default ClickHouse host
CLICKHOUSE_PORT=8123              # Default HTTP API port
CLICKHOUSE_DATABASE=default        # Database to store data
CLICKHOUSE_USERNAME=default        # Username (default user)
CLICKHOUSE_PASSWORD=               # Password (empty for local)
```

---

## Quick Reference Table

| Task | Command |
|------|---------|
| Download all data | `npm run download-history` |
| Download BTC only | `npm run download-history -- -s BTC/USDT:USDT` |
| Download 1 day of data | `npm run download-history -- --start 2024-12-01 --end 2024-12-02` |
| Check record count | `docker exec clickhouse clickhouse-client -q "SELECT COUNT(*) FROM ohlcv_binance"` |
| View latest prices | `docker exec clickhouse clickhouse-client -q "SELECT symbol, close FROM ohlcv_binance ORDER BY timestamp DESC LIMIT 5"` |
| Start ClickHouse | `docker run -d --name clickhouse -p 8123:8123 -p 9000:9000 -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 clickhouse/clickhouse-server` |
| Stop ClickHouse | `docker stop clickhouse` |
| Restart ClickHouse | `docker restart clickhouse` |
| Clear all data | `docker exec clickhouse clickhouse-client -q "DROP TABLE ohlcv_binance"` |

---

## Success Indicators

You'll know everything is working when you see:

✅ Download completes with "Download task completed!"
✅ Error count shows 0
✅ Total records shows a number > 0
✅ Running time is reasonable (seconds, not minutes)

Example successful run:
```
====================================
下载统计 / Download Statistics
====================================
总记录数 / Total Records: 2,000
总请求数 / Total Requests: 2
错误数 / Errors: 0  ← This is key!
运行时间 / Running Time: 7 秒 / seconds
====================================
```

---

## Need Help?

1. **Check documentation**
   - `CLICKHOUSE_RESOLUTION_COMPLETE.md` - Full resolution summary
   - `CLICKHOUSE_FINAL_TEST_REPORT.md` - Test results and verification
   - `TIMESTAMP_FIX_SUMMARY.md` - Technical details on timestamp fix

2. **Check logs**
   - ClickHouse: `docker logs clickhouse`
   - Application: Check terminal output for error messages

3. **Verify setup**
   ```bash
   # Test connection
   curl http://localhost:8123/ping

   # Check ClickHouse version
   docker exec clickhouse clickhouse-client -q "SELECT version()"
   ```

---

**Last Updated**: 2025-12-15
**Version**: 1.0 - Production Ready
