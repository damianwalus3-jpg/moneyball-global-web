# API-SPORTS API-FOOTBALL Pro — secure key setup

This application uses the user's paid API-SPORTS API-FOOTBALL Pro subscription.

- API base: `https://v3.football.api-sports.io`
- Authentication header: `x-apisports-key`
- Worker runtime secret: `API_FOOTBALL_API_KEY`
- Separate ingestion authorization secret: `INGESTION_TOKEN`
- Confirmed dashboard allowance: 7,500 requests/day

## Never disclose or commit the key

Do not paste the provider key into ChatGPT, GitHub issues, source files, frontend settings, build variables, screenshots, or logs. The key must exist only as a Cloudflare Worker runtime secret. The browser must never receive it.

## Configure the Worker

After the isolated Worker `football-intelligence-ai-api` has been created from repository `damianwalus3-jpg/moneyball-global-web`, branch `football-intelligence-ai`, root directory `FOOTBALL_INTELLIGENCE_AI`:

1. Open Cloudflare Dashboard → Workers & Pages → `football-intelligence-ai-api`.
2. Open Settings → Variables and Secrets.
3. Add a secret named exactly `API_FOOTBALL_API_KEY` and paste the API-SPORTS key as its value.
4. Add a second secret named exactly `INGESTION_TOKEN` with a separately generated, long random value.
5. Save and redeploy the Worker if Cloudflare requests it.

Do not add either value to `wrangler.toml`, GitHub, repository variables, or frontend build configuration.

## Verify without exposing secrets

1. Open `/health` and confirm the database is reachable.
2. Open `/api/provider/status`. The response must contain only sanitized plan/quota metadata; it must never include the API key, request headers, account email, or full provider payload.
3. Use the protected ingestion endpoints with `Authorization: Bearer <INGESTION_TOKEN>` only from a trusted administrative environment.
4. Confirm the provider reports the expected Pro subscription and daily quota before enabling scheduled ingestion.

## Quota policy

- Treat 7,500 requests/day as a hard upper bound, not a target.
- Keep a safety reserve; the current ingestion guard stops when fewer than 100 requests remain.
- Cache and deduplicate discovery and fixture requests.
- Do not repeatedly call enrichment for the same fixture when fresh snapshots already exist.
- Pace odds and enrichment calls, and record each endpoint, timestamp, result count, and provider rate-limit headers.
- Never infer that an endpoint or market is included in the plan until a real response confirms coverage.
- A provider status check is used to inspect subscription and usage; it must not be represented as a normal data-ingestion request if the provider documents it as quota-exempt.

## Current handoff status

The server-only API client and Worker secret binding are present in source. The API key has **not** been configured in Cloudflare, and live API verification has **not** been completed. The user must perform the one-time secret entry in Cloudflare; the key must not be sent in chat. Once the secret is configured and the Worker is deployed, run the provider status check and a controlled discovery refresh before enabling any scheduled ingestion.
