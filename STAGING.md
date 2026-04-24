# Staging Checklist

1. Copy `.env.staging.example` to `.env.staging`.
2. Replace every placeholder value in `.env.staging`.
3. Load the file into your shell or copy the values into `.env` on the staging host.
4. Run `node scripts/checkStagingEnv.js --file .env.staging`.
5. Run `npm run test`.
6. Deploy with one of:
   `bash scripts/deploy.sh deploy -e shadow -s single`
   `bash scripts/deploy.sh deploy -e shadow -s multi`

Notes:
- For public market-data shadow tests, set `PUBLIC_MARKET_ONLY=true` and `SHADOW_SKIP_PRIVATE_ACCOUNT_DATA=true`; do not configure real exchange credentials.
- `JWT_SECRET` must be a real random secret and at least 32 characters.
- `DASHBOARD_PASSWORD` must not use a placeholder value.
- If `.keys.enc` is present, `MASTER_KEY` must also be configured.
- `.env` and `.keys.enc` must not remain tracked by git.
