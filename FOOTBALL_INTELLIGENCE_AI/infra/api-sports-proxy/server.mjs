import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const API_BASE = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_SPORTS_KEY?.trim();
const PROXY_TOKEN = process.env.PROXY_TOKEN?.trim();
const PORT = Number(process.env.PORT || 8080);
const ALLOWED_PATHS = new Set([
  "status",
  "countries",
  "leagues",
  "leagues/seasons",
  "fixtures",
  "teams",
  "standings",
  "fixtures/statistics",
  "fixtures/lineups",
  "odds",
  "predictions",
  "injuries",
]);

if (!API_KEY || !PROXY_TOKEN) {
  throw new Error("API_SPORTS_KEY and PROXY_TOKEN must be configured");
}

function authorized(header) {
  const expected = Buffer.from(`Bearer ${PROXY_TOKEN}`);
  const supplied = Buffer.from(header || "");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  const incoming = new URL(request.url || "/", "http://proxy.internal");
  if (incoming.pathname === "/health") {
    return sendJson(response, 200, { status: "ok", service: "api-sports-egress-proxy" });
  }

  if (!authorized(request.headers.authorization)) {
    return sendJson(response, 401, { error: "unauthorized" });
  }

  const path = incoming.pathname.replace(/^\/+/, "");
  if (!ALLOWED_PATHS.has(path)) {
    return sendJson(response, 404, { error: "endpoint_not_allowed" });
  }

  try {
    const target = new URL(`/${path}${incoming.search}`, API_BASE);
    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-apisports-key": API_KEY,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await upstream.arrayBuffer();
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(Buffer.from(body));
  } catch {
    sendJson(response, 502, { error: "upstream_unavailable" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  // Do not log secrets, request headers, or provider payloads.
  console.log(JSON.stringify({ event: "proxy_started", port: PORT }));
});
