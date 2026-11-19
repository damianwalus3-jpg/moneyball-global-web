import { createApiFootballClient } from "../providers/apifootball/client";

interface D1Database {
  prepare(query: string): {
    first<T = unknown>(): Promise<T | null>;
  };
}

interface Env {
  DB: D1Database;
  API_FOOTBALL_API_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        if (result?.ok !== 1) return json({ status: "degraded", database: false }, 503);
        return json({ status: "ok", database: true, service: "football-intelligence-ai" });
      } catch {
        return json({ status: "degraded", database: false }, 503);
      }
    }

    if (url.pathname === "/api/provider/status") {
      if (!env.API_FOOTBALL_API_KEY) {
        return json({ error: "provider_secret_not_configured" }, 503);
      }

      try {
        const client = createApiFootballClient({ apiKey: env.API_FOOTBALL_API_KEY });
        const result = await client.getStatus();
        const status = result.response;
        return json({
          provider: "api-sports",
          product: "api-football",
          subscription: {
            plan: status.subscription?.plan ?? null,
            active: status.subscription?.active ?? null,
            end: status.subscription?.end ?? null,
          },
          requests: {
            current: status.requests?.current ?? null,
            dailyLimit: status.requests?.limit_day ?? null,
          },
        });
      } catch {
        // Do not return provider payloads or request details: they may contain sensitive data.
        return json({ error: "provider_status_unavailable" }, 502);
      }
    }

    return json({ error: "not_found" }, 404);
  },
};
