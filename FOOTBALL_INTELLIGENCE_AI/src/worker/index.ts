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
  jobType: "discovery" | "fixtures" | "enrichment",
  counts: { requests: number; seen: number; inserted: number },
  error?: string,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ingestion_jobs
      (provider, job_type, status, started_at, finished_at, requests_made, records_seen, records_inserted, error_message, created_at)
    VALUES ('api-sports', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(jobType, status, startedAt, now(), counts.requests, counts.seen, counts.inserted, error ?? null, startedAt).run();
}

interface FixtureTeam {
  id?: string | number;
  name?: string;
  logo?: string | null;
  winner?: boolean | null;
}
interface ProviderFixture {
  fixture?: {
    id?: string | number;
    date?: string;
    referee?: string | null;
    venue?: Record<string, unknown> | null;
    status?: { short?: string; long?: string; elapsed?: number | null };
  };
  league?: { id?: string | number; season?: number; name?: string; type?: string; logo?: string };
  teams?: { home?: FixtureTeam; away?: FixtureTeam };
  goals?: { home?: number | null; away?: number | null };
}
async function refreshFixtures(env: Env, date: string): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const client = providerClient(env);
    const accountResult = await client.getStatus();
    const account = accountResult.response;
    const dailyLimit = account.requests?.limit_day ?? null;
    const used = account.requests?.current ?? null;
    const remaining = dailyLimit !== null && used !== null ? Math.max(0, dailyLimit - used) : null;
    await env.DB.prepare(`
      INSERT INTO provider_accounts
        (provider, product, plan_name, subscription_active, daily_request_limit,
         daily_requests_used, daily_requests_remaining, observed_at, metadata_json)
      VALUES ('api-sports', 'api-football', ?, ?, ?, ?, ?, ?, '{}')
      ON CONFLICT(provider, product) DO UPDATE SET
        plan_name = excluded.plan_name, subscription_active = excluded.subscription_active,
        daily_request_limit = excluded.daily_request_limit,
        daily_requests_used = excluded.daily_requests_used,
        daily_requests_remaining = excluded.daily_requests_remaining,
        observed_at = excluded.observed_at
    `).bind(account.subscription?.plan ?? null,
      account.subscription?.active === undefined ? null : account.subscription.active ? 1 : 0,
      dailyLimit, used, remaining, now()).run();
    if (account.subscription?.active === false) throw new Error("provider_subscription_inactive");
    if (remaining !== null && remaining < 100) throw new Error("provider_quota_reserve_reached");

    const result = await client.getFixtures({ date }) as ApiFootballResponse<ProviderFixture[]>;
    counts.requests = 1;
    const fixtures = Array.isArray(result.response) ? result.response : [];
    await storeRaw(env.DB, "fixtures", result, fixtures.length);

    for (const item of fixtures) {
      const fixture = item.fixture;
      const league = item.league;
      const home = item.teams?.home;
      const away = item.teams?.away;
      if (!fixture?.id || !league?.id || !home?.id || !away?.id || !home.name || !away.name) continue;
      counts.seen++;
      const timestamp = now();
      const homeResult = await env.DB.prepare(`
        INSERT INTO teams (provider, provider_team_id, name, logo_url, source_updated_at)
        VALUES ('api-sports', ?, ?, ?, ?)
        ON CONFLICT(provider, provider_team_id) DO UPDATE SET
          name = excluded.name, logo_url = excluded.logo_url, source_updated_at = excluded.source_updated_at
      `).bind(String(home.id), home.name, home.logo ?? null, timestamp).run();
      const awayResult = await env.DB.prepare(`
        INSERT INTO teams (provider, provider_team_id, name, logo_url, source_updated_at)
        VALUES ('api-sports', ?, ?, ?, ?)
        ON CONFLICT(provider, provider_team_id) DO UPDATE SET
          name = excluded.name, logo_url = excluded.logo_url, source_updated_at = excluded.source_updated_at
      `).bind(String(away.id), away.name, away.logo ?? null, timestamp).run();
      counts.inserted += (homeResult.meta?.changes ?? 0) + (awayResult.meta?.changes ?? 0);
      const homeRow = await env.DB.prepare(
        "SELECT id FROM teams WHERE provider = 'api-sports' AND provider_team_id = ?",
      ).bind(String(home.id)).first<{ id: number }>();
      const awayRow = await env.DB.prepare(
        "SELECT id FROM teams WHERE provider = 'api-sports' AND provider_team_id = ?",
      ).bind(String(away.id)).first<{ id: number }>();
      if (!homeRow || !awayRow || homeRow.id === awayRow.id) continue;

      await env.DB.prepare(`
        INSERT INTO competitions
          (provider, provider_competition_id, name, type, logo_url, coverage_json, source_updated_at, created_at, updated_at)
        VALUES ('api-sports', ?, ?, NULL, ?, '{}', ?, ?, ?)
        ON CONFLICT(provider, provider_competition_id) DO UPDATE SET
          name = excluded.name, logo_url = excluded.logo_url, source_updated_at = excluded.source_updated_at,
          updated_at = excluded.updated_at
      `).bind(String(league.id), league.name ?? `Competition ${league.id}`,
        league.logo ?? null, timestamp, timestamp, timestamp).run();
      const competition = await env.DB.prepare(
        "SELECT id FROM competitions WHERE provider = 'api-sports' AND provider_competition_id = ?",
      ).bind(String(league.id)).first<{ id: number }>();
      let seasonId: number | null = null;
      if (competition && Number.isInteger(league.season)) {
        await env.DB.prepare(`
          INSERT INTO competition_seasons
            (competition_id, season_year, is_current, coverage_json, source_updated_at)
          VALUES (?, ?, 0, '{}', ?)
          ON CONFLICT(competition_id, season_year) DO UPDATE SET source_updated_at = excluded.source_updated_at
        `).bind(competition.id, league.season, timestamp).run();
        const season = await env.DB.prepare(
          "SELECT id FROM competition_seasons WHERE competition_id = ? AND season_year = ?",
        ).bind(competition.id, league.season).first<{ id: number }>();
        seasonId = season?.id ?? null;
      }
      const upsert = await env.DB.prepare(`
        INSERT INTO fixtures
          (provider, provider_fixture_id, competition_season_id, home_team_id, away_team_id,
           kickoff_at, status_short, status_long, elapsed_minutes, home_goals, away_goals,
           round_name, venue_json, referee, source_updated_at, last_seen_at, raw_summary_json, created_at, updated_at)
        VALUES ('api-sports', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_fixture_id) DO UPDATE SET
          competition_season_id = excluded.competition_season_id,
          home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
          kickoff_at = excluded.kickoff_at, status_short = excluded.status_short,
          status_long = excluded.status_long, elapsed_minutes = excluded.elapsed_minutes,
          home_goals = excluded.home_goals, away_goals = excluded.away_goals,
          round_name = excluded.round_name, venue_json = excluded.venue_json,
          referee = excluded.referee, source_updated_at = excluded.source_updated_at,
          last_seen_at = excluded.last_seen_at, raw_summary_json = excluded.raw_summary_json,
          updated_at = excluded.updated_at
      `).bind(String(fixture.id), seasonId, homeRow.id, awayRow.id,
        fixture.date ?? null, fixture.status?.short ?? null, fixture.status?.long ?? null,
        fixture.status?.elapsed ?? null, item.goals?.home ?? null, item.goals?.away ?? null,
        null, JSON.stringify(fixture.venue ?? {}), fixture.referee ?? null,
        timestamp, timestamp, JSON.stringify(item), timestamp, timestamp).run();
      counts.inserted += upsert.meta?.changes ?? 0;
    }
    await recordJob(env.DB, "succeeded", startedAt, "fixtures", counts);
    return json({
      status: "completed", provider: "api-sports", date,
      fixturesReceived: fixtures.length, fixturesProcessed: counts.seen,
      rowsChanged: counts.inserted, requestsMade: counts.requests,
      quota: { dailyLimit, used, remaining, safetyReserve: 100 },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "fixtures", counts, detail).catch(() => undefined);
    return json({ error: "fixture_sync_failed", detail }, 502);
  }
}


interface ProviderStatistic {
  team?: { id?: string | number; name?: string };
  statistics?: Array<{ type?: string; value?: string | number | null }>;
}
interface ProviderLineup {
  team?: { id?: string | number };
  formation?: string | null;
  coach?: Record<string, unknown> | null;
  startXI?: unknown[];
  substitutes?: unknown[];
}
interface ProviderInjury {
  team?: { id?: string | number };
  player?: { id?: string | number; name?: string; type?: string | null; reason?: string | null };
}
async function refreshFixtureEnrichment(env: Env, providerFixtureId: string): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const client = providerClient(env);
    const fixture = await env.DB.prepare(`
      SELECT id FROM fixtures WHERE provider = 'api-sports' AND provider_fixture_id = ?
    `).bind(providerFixtureId).first<{ id: number }>();
    if (!fixture) return json({ error: "fixture_not_found" }, 404);

    const account = (await client.getStatus()).response;
    const dailyLimit = account.requests?.limit_day ?? null;
    const used = account.requests?.current ?? null;
    const remaining = dailyLimit !== null && used !== null ? Math.max(0, dailyLimit - used) : null;
    await env.DB.prepare(`
      INSERT INTO provider_accounts
        (provider, product, plan_name, subscription_active, daily_request_limit,
         daily_requests_used, daily_requests_remaining, observed_at, metadata_json)
      VALUES ('api-sports', 'api-football', ?, ?, ?, ?, ?, ?, '{}')
      ON CONFLICT(provider, product) DO UPDATE SET
        plan_name = excluded.plan_name, subscription_active = excluded.subscription_active,
        daily_request_limit = excluded.daily_request_limit,
        daily_requests_used = excluded.daily_requests_used,
        daily_requests_remaining = excluded.daily_requests_remaining,
        observed_at = excluded.observed_at
    `).bind(account.subscription?.plan ?? null,
      account.subscription?.active === undefined ? null : account.subscription.active ? 1 : 0,
      dailyLimit, used, remaining, now()).run();
    if (account.subscription?.active === false) throw new Error("provider_subscription_inactive");
    if (remaining !== null && remaining < 100) throw new Error("provider_quota_reserve_reached");

    const [statisticsResult, lineupsResult, injuriesResult] = await Promise.all([
      client.getFixtureStatistics({ fixture: providerFixtureId }) as Promise<ApiFootballResponse<ProviderStatistic[]>>,
      client.getLineups(providerFixtureId) as Promise<ApiFootballResponse<ProviderLineup[]>>,
      client.getInjuries({ fixture: providerFixtureId }) as Promise<ApiFootballResponse<ProviderInjury[]>>,
    ]);
    counts.requests = 3;
    const statistics = Array.isArray(statisticsResult.response) ? statisticsResult.response : [];
    const lineups = Array.isArray(lineupsResult.response) ? lineupsResult.response : [];
    const injuries = Array.isArray(injuriesResult.response) ? injuriesResult.response : [];
    await Promise.all([
      storeRaw(env.DB, "fixtures/statistics", statisticsResult, statistics.length),
      storeRaw(env.DB, "fixtures/lineups", lineupsResult, lineups.length),
      storeRaw(env.DB, "injuries", injuriesResult, injuries.length),
    ]);
    const observedAt = now();

    for (const teamStats of statistics) {
      const providerTeamId = teamStats.team?.id;
      if (providerTeamId === undefined) continue;
      const team = await env.DB.prepare(
        "SELECT id FROM teams WHERE provider = 'api-sports' AND provider_team_id = ?",
      ).bind(String(providerTeamId)).first<{ id: number }>();
      if (!team) continue;
      for (const stat of teamStats.statistics ?? []) {
        if (!stat.type) continue;
        await env.DB.prepare(`
          INSERT INTO fixture_statistics
            (fixture_id, team_id, statistic_type, statistic_value_json, observed_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(fixture.id, team.id, stat.type, JSON.stringify(stat.value ?? null), observedAt).run();
        counts.seen++;
        counts.inserted++;
      }
    }

    for (const lineup of lineups) {
      const providerTeamId = lineup.team?.id;
      if (providerTeamId === undefined) continue;
      const team = await env.DB.prepare(
        "SELECT id FROM teams WHERE provider = 'api-sports' AND provider_team_id = ?",
      ).bind(String(providerTeamId)).first<{ id: number }>();
      if (!team) continue;
      await env.DB.prepare(`
        INSERT INTO fixture_lineups
          (fixture_id, team_id, formation, coach_json, start_xi_json, substitutes_json, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(fixture.id, team.id, lineup.formation ?? null,
        JSON.stringify(lineup.coach ?? {}), JSON.stringify(lineup.startXI ?? []),
        JSON.stringify(lineup.substitutes ?? []), observedAt).run();
      counts.seen++;
      counts.inserted++;
    }

    for (const injury of injuries) {
      const playerName = injury.player?.name;
      if (!playerName) continue;
      const providerTeamId = injury.team?.id;
      const team = providerTeamId === undefined ? null : await env.DB.prepare(
        "SELECT id FROM teams WHERE provider = 'api-sports' AND provider_team_id = ?",
      ).bind(String(providerTeamId)).first<{ id: number }>();
      await env.DB.prepare(`
        INSERT INTO fixture_injuries
          (fixture_id, team_id, player_provider_id, player_name, injury_type, reason, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(fixture.id, team?.id ?? null,
        injury.player?.id === undefined ? null : String(injury.player.id),
        playerName, injury.player?.type ?? null, injury.player?.reason ?? null, observedAt).run();
      counts.seen++;
      counts.inserted++;
    }

    await recordJob(env.DB, "succeeded", startedAt, "enrichment", counts);
    return json({
      status: "completed", fixtureId: providerFixtureId,
      statisticsRecords: statistics.reduce((sum, row) => sum + (row.statistics?.length ?? 0), 0),
      lineupTeams: lineups.length, injuryRecords: injuries.length,
      rowsStored: counts.inserted, requestsMade: counts.requests,
      quota: { dailyLimit, used, remaining, safetyReserve: 100 },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "enrichment", counts, detail).catch(() => undefined);
    return json({ error: "fixture_enrichment_failed", detail }, 502);
  }
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
    const accountResult = await client.getStatus();
    const account = accountResult.response;
    const dailyLimit = account.requests?.limit_day ?? null;
    const used = account.requests?.current ?? null;
    const remaining = dailyLimit !== null && used !== null ? Math.max(0, dailyLimit - used) : null;
    await env.DB.prepare(`
      INSERT INTO provider_accounts
        (provider, product, plan_name, subscription_active, daily_request_limit,
         daily_requests_used, daily_requests_remaining, observed_at, metadata_json)
      VALUES ('api-sports', 'api-football', ?, ?, ?, ?, ?, ?, '{}')
      ON CONFLICT(provider, product) DO UPDATE SET
        plan_name = excluded.plan_name, subscription_active = excluded.subscription_active,
        daily_request_limit = excluded.daily_request_limit,
        daily_requests_used = excluded.daily_requests_used,
        daily_requests_remaining = excluded.daily_requests_remaining,
        observed_at = excluded.observed_at
    `).bind(account.subscription?.plan ?? null,
      account.subscription?.active === undefined ? null : account.subscription.active ? 1 : 0,
      dailyLimit, used, remaining, now()).run();
    if (account.subscription?.active === false) {
      throw new Error("provider_subscription_inactive");
    }
    if (remaining !== null && remaining < 100) {
      throw new Error("provider_quota_reserve_reached");
    }
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
      if (!country.name) continue;
      counts.seen++;
      const providerCountryId = country.id === undefined ? null : String(country.id);
      const result = country.code
        ? await env.DB.prepare(`
            INSERT INTO countries (provider, provider_country_id, name, code, flag_url, source_updated_at)
            VALUES ('api-sports', ?, ?, ?, ?, ?)
            ON CONFLICT(provider, code) DO UPDATE SET
              provider_country_id = excluded.provider_country_id, name = excluded.name,
              flag_url = excluded.flag_url, source_updated_at = excluded.source_updated_at
          `).bind(providerCountryId, country.name, country.code, country.flag ?? null, now()).run()
        : await env.DB.prepare(`
            INSERT INTO countries (provider, provider_country_id, name, code, flag_url, source_updated_at)
            VALUES ('api-sports', ?, ?, NULL, ?, ?)
            ON CONFLICT(provider, provider_country_id) DO UPDATE SET
              name = excluded.name, flag_url = excluded.flag_url, source_updated_at = excluded.source_updated_at
          `).bind(providerCountryId ?? country.name, country.name, country.flag ?? null, now()).run();
      if (result.meta?.changes) counts.inserted += result.meta.changes;
      const saved = country.code
        ? await env.DB.prepare(
            "SELECT id FROM countries WHERE provider = 'api-sports' AND code = ?",
          ).bind(country.code).first<{ id: number }>()
        : await env.DB.prepare(
            "SELECT id FROM countries WHERE provider = 'api-sports' AND name = ?",
          ).bind(country.name).first<{ id: number }>();
      if (saved) {
        countryIds.set(country.name.toLowerCase(), saved.id);
        if (country.code) countryIds.set(country.code.toLowerCase(), saved.id);
      }
    }

    for (const league of leagues) {
      if (league.id === undefined || !league.name) continue;
      counts.seen++;
      const countryName = league.country?.name?.toLowerCase();
      const countryCode = league.country?.code?.toLowerCase();
      const countryId = (countryName ? countryIds.get(countryName) : undefined)
        ?? (countryCode ? countryIds.get(countryCode) : undefined)
        ?? null;
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

    await recordJob(env.DB, "succeeded", startedAt, "discovery", counts);
    return json({
      status: "completed",
      provider: "api-sports",
      fetchedAt: startedAt,
      countries: countries.length,
      leagues: leagues.length,
      recordsSeen: counts.seen,
      rowsChanged: counts.inserted,
      requestsMade: counts.requests,
      quota: { dailyLimit, used, remaining, safetyReserve: 100 },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "discovery", counts, code).catch(() => undefined);
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
    if (url.pathname === "/api/fixtures/enrich") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const fixtureId = url.searchParams.get("fixture") ?? "";
      if (!/^\\d+$/.test(fixtureId)) return json({ error: "invalid_fixture_id" }, 400);
      return refreshFixtureEnrichment(env, fixtureId);
    }
    if (url.pathname === "/api/fixtures/refresh") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const date = url.searchParams.get("date") ?? "";
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
      }
      return refreshFixtures(env, date);
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
