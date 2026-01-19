---
name: web-dashboard
description: Develop or update the web dashboard and its API integration. Use when modifying UI pages, state stores, or the frontend API layer.
---

# Web Dashboard

## Workflow

1. Work in `web/` for the frontend (Vite + Vue).
2. Start from `web/src/main.js`, `web/src/App.vue`, and routes in `web/src/router/`.
3. Add views in `web/src/views/` and shared UI in `web/src/components/`.
4. Update API clients in `web/src/api/` and state in `web/src/stores/`.
5. Coordinate backend endpoints in `src/api/` and its `routes/` subfolder.
6. Run the UI with `pnpm --dir web dev` or `npm --prefix web run dev`.
