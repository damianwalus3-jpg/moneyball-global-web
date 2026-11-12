# MONEYBALL GLOBAL 2.0

Mobile-first Polish football prediction tracker (1X2 and Double Chance separately), with match history, settlement, coupons, statistics and bankroll.

## Hosting
Static SPA on GitHub Pages, built with TanStack Start SPA mode and Nitro's `github_pages` preset. GitHub Actions publishes `.output/public` and creates a `404.html` fallback so deep links work.

## Data
The app connects to the existing production Supabase project `gzgeklcukrclgwbsmbsp` (EU West). The separate `xwrgfaarmwnguymresjy` project is not used by this repository. Existing database and user records are not copied, reset or replaced. The browser must only receive the public/publishable Supabase key; do not put service-role or secret keys in the repository.

## Build locally
```sh
bun install
bun run test
bun run build
```
