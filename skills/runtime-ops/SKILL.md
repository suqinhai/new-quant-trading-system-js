---
name: runtime-ops
description: Operate, deploy, and troubleshoot runtime behavior using PM2, Docker, and monitoring configs. Use when starting or stopping services, editing process configs, or debugging runtime issues.
---

# Runtime Operations

## Workflow

1. Use `package.json` scripts (`npm run shadow`, `npm run live`, `npm run backtest`, `npm run pm2:start`) for standard runs.
2. Edit process configs in `ecosystem.config.cjs` or `ecosystem.config.js` for PM2 orchestration.
3. Use `docker-compose.single-strategy.yml` and `docker-compose.multi-strategy.yml` for containerized runs.
4. Check `start-all-strategies.sh` for multi-strategy startup behavior.
5. Review monitoring configs in `config/prometheus/`, `config/grafana/`, `config/loki/`, and `config/alertmanager/`.
6. Use logs under `docker-logs/` or PM2 logs when troubleshooting.

## References

- Read `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT_GUIDE.md`, `docs/DEPLOY-MULTI-STRATEGY.md`, and `docs/TROUBLESHOOTING.md`.
