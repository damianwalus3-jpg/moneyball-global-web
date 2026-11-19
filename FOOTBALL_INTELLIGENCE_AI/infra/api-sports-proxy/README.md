# API-SPORTS dedicated-egress proxy

This small Node.js 22 service forwards only approved API-FOOTBALL GET endpoints. It is intended to run on a VPS with its own dedicated public IPv4 address.

## Why this exists

API-SPORTS documents that shared serverless outbound IPs can trigger network-level rate limits even while an individual API key still has daily quota remaining. A dedicated egress address separates this application's API traffic from unrelated Cloudflare customers.

## Requirements

- A VPS or cloud runtime with a dedicated, stable public outbound IPv4 address
- Node.js 22+
- The API-SPORTS key (stored only on this proxy)
- A separate long random proxy token

Do not deploy this proxy on another shared serverless egress network; that would preserve the original failure mode.

## Run

Set these environment variables on the VPS:

- `API_SPORTS_KEY`: the API-SPORTS API-FOOTBALL key
- `PROXY_TOKEN`: a long random secret used only between the Cloudflare Worker and this proxy
- `PORT`: optional; defaults to 8080

Then run:

```sh
npm start
```

Put the service behind HTTPS (for example, a reverse proxy such as Caddy or nginx with a valid TLS certificate). Expose only HTTPS publicly. The proxy itself accepts only GET requests and a fixed allowlist of API-FOOTBALL paths; it is not an open relay.

## Connect the Cloudflare Worker

Set these Worker variables/secrets:

- `API_FOOTBALL_PROXY_URL`: the HTTPS base URL of this proxy, without a trailing path
- `API_FOOTBALL_PROXY_TOKEN`: the same random token as `PROXY_TOKEN` on the VPS

When both are configured, the Worker sends API-FOOTBALL requests through the proxy and does not send its API key to API-SPORTS directly. The existing `API_FOOTBALL_API_KEY` secret can then be removed from the Worker after the proxy is verified; the API key remains only on the VPS.

## Verify

1. Open `https://YOUR_PROXY_HOST/health`; expect `{"status":"ok","service":"api-sports-egress-proxy"}`.
2. Open the Worker endpoint `/api/provider/status?diagnostic=1`; expect `available: true` and the Pro subscription details.
3. Check the API-SPORTS dashboard request history and confirm the observed source IP matches the VPS public IPv4 address.
4. Trigger one fixture sync and confirm the D1 fixture count increases.
5. Only after these checks, remove the direct `API_FOOTBALL_API_KEY` Worker secret.

Never place either secret in browser code, a public repository, a URL, or a chat message.
