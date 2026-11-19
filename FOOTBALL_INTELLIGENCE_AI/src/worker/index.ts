import { createApiFootballClient, type ApiFootballResponse } from "../providers/apifootball/client";

interface D1Result { success: boolean; meta?: { changes?: number } }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1Statement;
}
interface Env {
  DB: D1Database;
  API_FOOTBALL_API_KEY?: string;
  INGESTION_TOKEN?: string;
}
interface Country {
  id?: string | number;
  name?: string;
  code?: string | null;
  flag?: string | null;
}
interface LeagueSeason {
  year?: number;
  start?: string | null;
  end?: string | null;
  current?: boolean;
  coverage?: Record<string, unknown>;
}
interface League {
  id?: string | number;
  name?: string;
  type?: string;
  logo?: string | null;
  country?: { name?: string | null; code?: string | null; flag?: string | null };
  seasons?: LeagueSeason[];
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
function now(): string { return new Date().toISOString(); }
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function storeRaw(
  db: D1Database,
  endpoint: string,
  payload: unknown,
  results: number,
): Promise<void> {
  const serialized = JSON.stringify(payload);
  await db.prepare(`
    INSERT OR IGNORE INTO raw_provider_payloads
      (provider, endpoint, request_params_json, payload_json, payload_sha256, fetched_at, http_status, provider_results)
    VALUES ('api-sports', ?, '{}', ?, ?, ?, 200, ?)
  `).bind(endpoint, serialized, await sha256(serialized), now(), results).run();
}
async function recordJob(
  db: D1Database,
  status: "succeeded" | "failed",
  startedAt: string,
  counts: { requests: number; seen: number; inserted: number },
  error?: string,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ingestion_jobs
      (provider, job_type, status, started_at, finished_at, requests_made, records_seen, records_inserted, error_message, created_at)
    VALUES ('api-sports', 'discovery', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(status, startedAt, now(), counts.requests, counts.seen, counts.inserted, error ?? null, startedAt).run();
}
function providerClient(env: Env) {
  if (!env.API_FOOTBALL_API_KEY) throw new Error("provider_secret_not_configured");
  return createApiFootballClient({ apiKey: env.API_FOOTBALL_API_KEY });
}
async function refreshDiscovery(env: Env): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const client = providerClient(env);
    const [countriesResult, leaguesResult] = await Promise.all([
      client.getCountries() as Promise<ApiFootballResponse<Country[]>>,
      client.getLeagues() as Promise<ApiFootballResponse<League[]>>,
    ]);
    counts.requests = 2;
    const countries = Array.isArray(countriesResult.response) ? countriesResult.response : [];
    const leagues = Array.isArray(leaguesResult.response) ? leaguesResult.response : [];
    await storeRaw(env.DB, "countries", countriesResult, countries.length);
    await storeRaw(env.DB, "leagues", leaguesResult, leagues.length);

    const countryIds = new Map<string, number>();
    for (const country of countries) {
      if (country.id === undefined || !country.name) continue;
      counts.seen++;
      const result = await env.DB.prepare(`
        INSERT INTO countries (provider, provider_country_id, name, code, flag_url, source_updated_at)
        VALUES ('api-sports', ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_country_id) DO UPDATE SET
          name = excluded.name, code = excluded.code, flag_url = excluded.flag_url,
          source_updated_at = excluded.source_updated_at
      `).bind(String(country.id), country.name, country.code ?? null, country.flag ?? null, now()).run();
      if (result.meta?.changes) counts.inserted += result.meta.changes;
      const saved = await env.DB.prepare(
        "SELECT id FROM countries WHERE provider = 'api-sports' AND provider_country_id = ?",
      ).bind(String(country.id)).first<{ id: number }>();
      if (saved) countryIds.set(country.name.toLowerCase(), saved.id);
    }

    for (const league of leagues) {
      if (league.id === undefined || !league.name) continue;
      counts.seen++;
      const countryName = league.country?.name?.toLowerCase();
      const countryId = countryName ? countryIds.get(countryName) ?? null : null;
      const upsert = await env.DB.prepare(`
        INSERT INTO competitions
          (provider, provider_competition_id, country_id, name, type, logo_url, coverage_json, source_updated_at, created_at, updated_at)
        VALUES ('api-sports', ?, ?, ?, ?, ?, '{}', ?, ?, ?)
        ON CONFLICT(provider, provider_competition_id) DO UPDATE SET
          country_id = excluded.country_id, name = excluded.name, type = excluded.type,
          logo_url = excluded.logo_url, source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
      `).bind(String(league.id), countryId, league.name, league.type ?? null, league.logo ?? null, now(), now(), now()).run();
      if (upsert.meta?.changes) counts.inserted += upsert.meta.changes;
      const saved = await env.DB.prepare(
        "SELECT id FROM competitions WHERE provider = 'api-sports' AND provider_competition_id = ?",
      ).bind(String(league.id)).first<{ id: number }>();
      if (!saved) continue;
      for (const season of league.seasons ?? []) {
        if (!Number.isInteger(season.year)) continue;
        await env.DB.prepare(`
          INSERT INTO competition_seasons
            (competition_id, season_year, start_date, end_date, is_current, coverage_json, source_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(competition_id, season_year) DO UPDATE SET
            start_date = excluded.start_date, end_date = excluded.end_date,
            is_current = excluded.is_current, coverage_json = excluded.coverage_json,
            source_updated_at = excluded.source_updated_at
        `).bind(saved.id, season.year, season.start ?? null, season.end ?? null,
          season.current ? 1 : 0, JSON.stringify(season.coverage ?? {}), now()).run();
      }
    }

    await recordJob(env.DB, "succeeded", startedAt, counts);
    return json({
      status: "completed",
      provider: "api-sports",
      fetchedAt: startedAt,
      countries: countries.length,
      leagues: leagues.length,
      recordsSeen: counts.seen,
      rowsChanged: counts.inserted,
      requestsMade: counts.requests,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, counts, code).catch(() => undefined);
    if (code === "provider_secret_not_configured") {
      return json({ error: code }, 503);
    }
    return json({ error: "discovery_sync_failed", detail: code }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        if (result?.ok !== 1) return json({ status: "degraded", database: false }, 503);
        return json({ status: "ok", database: true, service: "football-intelligence-ai" });
      } catch {
        return json({ status: "degraded", database: false }, 503);
      }
    }
    if (url.pathname === "/api/provider/status") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      try {
        const result = await providerClient(env).getStatus();
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
        return json({ error: env.API_FOOTBALL_API_KEY ? "provider_status_unavailable" : "provider_secret_not_configured" }, 503);
      }
    }
    if (url.pathname === "/api/discovery/refresh") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      return refreshDiscovery(env);
    }
    return json({ error: "not_found" }, 404);
  },
};
