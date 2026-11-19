import { ApiFootballError, createApiFootballClient, type ApiFootballResponse } from "../providers/apifootball/client";

interface D1Result { success: boolean; meta?: { changes?: number } }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
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

interface ScheduledControllerLike { scheduledTime: number }
interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }
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

const DASHBOARD_HTML = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#101827">
<title>FOOTBALL INTELLIGENCE AI</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#0b1220;color:#e5edf8}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#101b2d,#0b1220 55%);min-height:100vh}
main{max-width:1100px;margin:auto;padding:24px 16px 60px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
h1{font-size:clamp(24px,5vw,36px);margin:0;letter-spacing:-.04em}.sub{color:#9fb0c7;margin:8px 0 24px}
.panel{background:#131f31;border:1px solid #29384e;border-radius:16px;padding:16px;margin:14px 0}
.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}input,button{font:inherit;border-radius:10px;border:1px solid #34455f;padding:10px 12px;background:#0d1727;color:#edf4ff}
button{cursor:pointer;background:#1e65d6;border-color:#3679e4;font-weight:650}button:disabled{opacity:.5;cursor:wait}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.stat{background:#0d1727;border-radius:12px;padding:12px}.stat strong{display:block;font-size:23px}.stat span{font-size:12px;color:#9fb0c7}
.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #28364a;font-size:13px}th{color:#9fb0c7;font-weight:600}td small{display:block;color:#91a4bd;margin-top:4px}.pill{display:inline-block;padding:4px 8px;border-radius:20px;background:#1b2c43;color:#c7d8ee;font-size:11px}
.muted{color:#94a6bf}.empty{text-align:center;padding:35px 12px;color:#9fb0c7}.foot{font-size:12px;color:#8093ad;margin-top:18px}
@media(max-width:600px){main{padding:18px 12px}.stats{grid-template-columns:repeat(3,1fr)}.stat strong{font-size:19px}}
</style></head>
<body><main>
<div class="top"><div><h1>⚽ FOOTBALL INTELLIGENCE AI</h1><div class="sub">Centrum analizy meczów i prognoz • czas: Europe/Brussels</div></div><span class="pill" id="state">Oczekiwanie na dane</span></div>
<section class="panel">
<div class="controls"><label for="day">Data meczów</label><input id="day" type="date"><button id="load">Synchronizuj i pobierz mecze</button></div>
<div class="stats"><div class="stat"><strong id="count">—</strong><span>Mecze</span></div><div class="stat"><strong id="predicted">—</strong><span>Z prognozą</span></div><div class="stat"><strong id="finished">—</strong><span>Zakończone</span></div></div>
</section>
<section class="panel"><div class="top"><h2 style="font-size:18px;margin:0">Mecze i prognozy</h2><span class="muted" id="updated"></span></div>
<div class="tablewrap"><table><thead><tr><th>Godzina</th><th>Mecz / rozgrywki</th><th>Wynik</th><th>1</th><th>X</th><th>2</th><th>1X</th><th>X2</th><th>O2.5</th><th>BTTS</th></tr></thead><tbody id="rows"><tr><td colspan="10" class="empty">Wybierz datę i pobierz mecze.</td></tr></tbody></table></div>
<div class="foot">Prognozy są eksperymentalnym modelem statystycznym, nie gwarancją wyniku ani poradą bukmacherską. Brak prognozy oznacza brak wyliczenia, nie 0%.</div>
</section></main>
<script>
const $=id=>document.getElementById(id);
const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Brussels",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
const date=Object.fromEntries(parts.map(p=>[p.type,p.value]));
$("day").value=date.year+"-"+date.month+"-"+date.day;
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const pct=v=>v===null||v===undefined?"—":(Number(v)*100).toFixed(1)+"%";
const time=v=>v?new Intl.DateTimeFormat("pl-BE",{timeZone:"Europe/Brussels",hour:"2-digit",minute:"2-digit"}).format(new Date(v)):"—";
async function load(sync=false){
 const day=$("day").value;if(!day)return;
 $("load").disabled=true;$("state").textContent=sync?"Synchronizuję dane…":"Ładowanie…";
 try{
  if(sync){
   const syncResponse=await fetch("/api/fixtures/sync?date="+encodeURIComponent(day),{method:"POST"});
   const syncData=await syncResponse.json();
   if(!syncResponse.ok)throw new Error(syncData.detail||syncData.error||"Synchronizacja nie powiodła się");
  }
  const response=await fetch("/api/fixtures?date="+encodeURIComponent(day));
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Błąd pobierania");
  const list=data.fixtures||[];
  $("count").textContent=list.length;
  $("predicted").textContent=list.filter(x=>x.probability_home!==null).length;
  $("finished").textContent=list.filter(x=>["FT","AET","PEN"].includes(x.status_short)).length;
  $("rows").innerHTML=list.length?list.map(x=>"<tr><td>"+time(x.kickoff_at)+"<small>"+esc(x.status_short||"—")+"</small></td><td><strong>"+esc(x.home_team)+" – "+esc(x.away_team)+"</strong><small>"+esc(x.competition||"Rozgrywki nieznane")+(x.country?" • "+esc(x.country):"")+"</small></td><td>"+(x.home_goals===null?"—":esc(x.home_goals+" : "+x.away_goals))+"</td><td>"+pct(x.probability_home)+"</td><td>"+pct(x.probability_draw)+"</td><td>"+pct(x.probability_away)+"</td><td>"+pct(x.probability_1x)+"</td><td>"+pct(x.probability_x2)+"</td><td>"+pct(x.probability_over_25)+"</td><td>"+pct(x.probability_btts_yes)+"</td></tr>").join(""):"<tr><td colspan='10' class='empty'>Brak zapisanych meczów dla tej daty. Najpierw musi zadziałać synchronizacja danych.</td></tr>";
  $("updated").textContent="Pobrano: "+new Date().toLocaleTimeString("pl-BE");
  $("state").textContent=sync?"Synchronizacja zakończona":"Dane załadowane";
 }catch(e){$("state").textContent="Błąd";$("rows").innerHTML="<tr><td colspan='10' class='empty'>"+esc(e.message)+"</td></tr>";}
 finally{$("load").disabled=false;}
}
$("load").addEventListener("click",()=>load(true));$("day").addEventListener("change",()=>load(false));load(false);
</script></body></html>`;

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
function brusselsCalendarDate(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function toUtcIso(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function brusselsLocalMidnightUtc(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(targetUtc));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const observedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return new Date(targetUtc - (observedAsUtc - targetUtc)).toISOString();
}
function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
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
  jobType: "discovery" | "fixtures" | "enrichment" | "predictions" | "evaluation" | "odds",
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
    counts.requests = 1; // provider status preflight
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
    counts.requests += 1;
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
        toUtcIso(fixture.date), fixture.status?.short ?? null, fixture.status?.long ?? null,
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
    counts.requests = 1; // provider status preflight
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
    counts.requests += 3;
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



interface HistoricalResult {
  home_team_id: number;
  away_team_id: number;
  home_goals: number;
  away_goals: number;
}
interface ModelFixture {
  id: number;
  provider_fixture_id: string;
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
}
function poisson(lambda: number, goals: number): number {
  let factorial = 1;
  for (let i = 2; i <= goals; i++) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}
function estimateProbabilities(lambdaHome: number, lambdaAway: number) {
  const home = Array.from({ length: 11 }, (_, i) => poisson(lambdaHome, i));
  const away = Array.from({ length: 11 }, (_, i) => poisson(lambdaAway, i));
  const total = home.reduce((a, b) => a + b, 0) * away.reduce((a, b) => a + b, 0);
  let pHome = 0, pDraw = 0, pAway = 0, pOver25 = 0, pBtts = 0;
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = (home[h] * away[a]) / total;
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a >= 3) pOver25 += p;
      if (h > 0 && a > 0) pBtts += p;
    }
  }
  return {
    home: pHome, draw: pDraw, away: pAway,
    over25: pOver25, under25: 1 - pOver25,
    btts: pBtts, noBtts: 1 - pBtts,
  };
}
function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
async function generatePredictions(env: Env, date: string): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const targets = await env.DB.prepare(`
      SELECT f.id, f.provider_fixture_id, f.kickoff_at, f.home_team_id, f.away_team_id,
        home.name AS home_team, away.name AS away_team
      FROM fixtures f
      JOIN teams home ON home.id = f.home_team_id
      JOIN teams away ON away.id = f.away_team_id
      WHERE f.provider = 'api-sports' AND f.kickoff_at >= ? AND f.kickoff_at < ?
        AND f.status_short = 'NS'
      ORDER BY f.kickoff_at ASC LIMIT 50
    `).bind(brusselsLocalMidnightUtc(date), brusselsLocalMidnightUtc(nextCalendarDate(date))).all<ModelFixture>();
    const fixtures = targets.results;
    if (!fixtures.length) return json({ status: "no_fixtures", date, generated: 0 });
    const model = await env.DB.prepare(`
      INSERT INTO model_versions (model_key, version, description, created_at)
      VALUES ('poisson-baseline', '1.0.0', 'Time-safe team goal averages with independent Poisson score grid', ?)
      ON CONFLICT(model_key, version) DO NOTHING
    `).bind(now()).run();
    const modelRow = await env.DB.prepare(
      "SELECT id FROM model_versions WHERE model_key = 'poisson-baseline' AND version = '1.0.0'",
    ).first<{ id: number }>();
    if (!modelRow) throw new Error("model_version_unavailable");

    for (const fixture of fixtures) {
      const cutoff = fixture.kickoff_at;
      const [homeHistory, awayHistory] = await Promise.all([
        env.DB.prepare(`
          SELECT home_team_id, away_team_id, home_goals, away_goals
          FROM fixtures
          WHERE status_short IN ('FT', 'AET', 'PEN') AND home_goals IS NOT NULL AND away_goals IS NOT NULL
            AND kickoff_at < ? AND (home_team_id = ? OR away_team_id = ?)
          ORDER BY kickoff_at DESC LIMIT 10
        `).bind(cutoff, fixture.home_team_id, fixture.home_team_id).all<HistoricalResult>(),
        env.DB.prepare(`
          SELECT home_team_id, away_team_id, home_goals, away_goals
          FROM fixtures
          WHERE status_short IN ('FT', 'AET', 'PEN') AND home_goals IS NOT NULL AND away_goals IS NOT NULL
            AND kickoff_at < ? AND (home_team_id = ? OR away_team_id = ?)
          ORDER BY kickoff_at DESC LIMIT 10
        `).bind(cutoff, fixture.away_team_id, fixture.away_team_id).all<HistoricalResult>(),
      ]);
      const homeScored = homeHistory.results.map(row => row.home_team_id === fixture.home_team_id ? row.home_goals : row.away_goals);
      const homeConceded = homeHistory.results.map(row => row.home_team_id === fixture.home_team_id ? row.away_goals : row.home_goals);
      const awayScored = awayHistory.results.map(row => row.home_team_id === fixture.away_team_id ? row.home_goals : row.away_goals);
      const awayConceded = awayHistory.results.map(row => row.home_team_id === fixture.away_team_id ? row.away_goals : row.home_goals);
      const lambdaHome = Math.min(3.5, Math.max(0.2, ((mean(homeScored) ?? 1.35) + (mean(awayConceded) ?? 1.35)) / 2));
      const lambdaAway = Math.min(3.5, Math.max(0.2, ((mean(awayScored) ?? 1.1) + (mean(homeConceded) ?? 1.1)) / 2));
      const p = estimateProbabilities(lambdaHome, lambdaAway);
      const generatedAt = now();
      await env.DB.prepare(`
        INSERT INTO match_predictions
          (fixture_id, model_version_id, generated_at, feature_cutoff_at, lambda_home, lambda_away,
           probability_home, probability_draw, probability_away, probability_1x, probability_x2,
           probability_12, probability_over_25, probability_under_25, probability_btts_yes,
           probability_btts_no, sample_home, sample_away, explanation_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fixture_id, model_version_id, feature_cutoff_at) DO UPDATE SET
          generated_at = excluded.generated_at, lambda_home = excluded.lambda_home,
          lambda_away = excluded.lambda_away, probability_home = excluded.probability_home,
          probability_draw = excluded.probability_draw, probability_away = excluded.probability_away,
          probability_1x = excluded.probability_1x, probability_x2 = excluded.probability_x2,
          probability_12 = excluded.probability_12, probability_over_25 = excluded.probability_over_25,
          probability_under_25 = excluded.probability_under_25,
          probability_btts_yes = excluded.probability_btts_yes,
          probability_btts_no = excluded.probability_btts_no,
          sample_home = excluded.sample_home, sample_away = excluded.sample_away,
          explanation_json = excluded.explanation_json
      `).bind(fixture.id, modelRow.id, generatedAt, cutoff, lambdaHome, lambdaAway,
        p.home, p.draw, p.away, p.home + p.draw, p.away + p.draw, p.home + p.away,
        p.over25, p.under25, p.btts, p.noBtts, homeHistory.results.length,
        awayHistory.results.length, JSON.stringify({
          model: "poisson-baseline@1.0.0",
          features: "last 10 completed matches per team, all venues",
          noLookahead: true,
          cutoff,
          fallback: homeHistory.results.length === 0 || awayHistory.results.length === 0,
        })).run();
      counts.seen++;
      counts.inserted++;
    }
    await recordJob(env.DB, "succeeded", startedAt, "predictions", counts);
    return json({ status: "completed", date, model: "poisson-baseline@1.0.0", generated: counts.inserted });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "predictions", counts, detail).catch(() => undefined);
    return json({ error: "prediction_generation_failed", detail }, 502);
  }
}


interface EvaluationRow {
  prediction_id: number;
  fixture_id: number;
  home_goals: number;
  away_goals: number;
  probability_home: number;
  probability_draw: number;
  probability_away: number;
  probability_over_25: number;
  probability_btts_yes: number;
}
async function evaluatePredictions(env: Env, date: string): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const start = brusselsLocalMidnightUtc(date);
    const end = brusselsLocalMidnightUtc(nextCalendarDate(date));
    const rows = await env.DB.prepare(`
      SELECT mp.id AS prediction_id, f.id AS fixture_id, f.home_goals, f.away_goals,
        mp.probability_home, mp.probability_draw, mp.probability_away,
        mp.probability_over_25, mp.probability_btts_yes
      FROM fixtures f
      JOIN match_predictions mp ON mp.id = (
        SELECT id FROM match_predictions WHERE fixture_id = f.id ORDER BY generated_at DESC LIMIT 1
      )
      WHERE f.provider = 'api-sports' AND f.kickoff_at >= ? AND f.kickoff_at < ?
        AND f.status_short IN ('FT', 'AET', 'PEN')
        AND f.home_goals IS NOT NULL AND f.away_goals IS NOT NULL
      ORDER BY f.kickoff_at ASC LIMIT 250
    `).bind(start, end).all<EvaluationRow>();
    for (const row of rows.results) {
      const actual = row.home_goals > row.away_goals ? "1" : row.home_goals === row.away_goals ? "X" : "2";
      const yHome = actual === "1" ? 1 : 0;
      const yDraw = actual === "X" ? 1 : 0;
      const yAway = actual === "2" ? 1 : 0;
      const pActual = actual === "1" ? row.probability_home : actual === "X" ? row.probability_draw : row.probability_away;
      const actualOver = row.home_goals + row.away_goals > 2 ? 1 : 0;
      const actualBtts = row.home_goals > 0 && row.away_goals > 0 ? 1 : 0;
      const brier1x2 =
        Math.pow(row.probability_home - yHome, 2) +
        Math.pow(row.probability_draw - yDraw, 2) +
        Math.pow(row.probability_away - yAway, 2);
      const logLoss = -Math.log(Math.max(1e-15, Math.min(1, pActual)));
      const brierOver = Math.pow(row.probability_over_25 - actualOver, 2);
      const brierBtts = Math.pow(row.probability_btts_yes - actualBtts, 2);
      await env.DB.prepare(`
        INSERT INTO prediction_evaluations
          (prediction_id, fixture_id, evaluated_at, actual_outcome, actual_over_25, actual_btts_yes,
           brier_1x2, log_loss_1x2, brier_over_25, brier_btts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(prediction_id) DO UPDATE SET
          evaluated_at = excluded.evaluated_at, actual_outcome = excluded.actual_outcome,
          actual_over_25 = excluded.actual_over_25, actual_btts_yes = excluded.actual_btts_yes,
          brier_1x2 = excluded.brier_1x2, log_loss_1x2 = excluded.log_loss_1x2,
          brier_over_25 = excluded.brier_over_25, brier_btts = excluded.brier_btts
      `).bind(row.prediction_id, row.fixture_id, now(), actual, actualOver, actualBtts,
        brier1x2, logLoss, brierOver, brierBtts).run();
      counts.seen++;
      counts.inserted++;
    }
    await recordJob(env.DB, "succeeded", startedAt, "evaluation", counts);
    return json({ status: "completed", date, evaluated: counts.inserted, scoring: ["Brier 1X2", "Log loss 1X2", "Brier Over 2.5", "Brier BTTS"] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "evaluation", counts, detail).catch(() => undefined);
    return json({ error: "prediction_evaluation_failed", detail }, 502);
  }
}


interface ProviderOddsValue { value?: string; odd?: string | number }
interface ProviderOddsMarket { id?: string | number; name?: string; values?: ProviderOddsValue[] }
interface ProviderOddsBookmaker { id?: string | number; name?: string; bets?: ProviderOddsMarket[] }
interface ProviderOddsFixture { fixture?: { id?: string | number }; bookmakers?: ProviderOddsBookmaker[] }
async function refreshFixtureOdds(env: Env, providerFixtureId: string): Promise<Response> {
  const startedAt = now();
  const counts = { requests: 0, seen: 0, inserted: 0 };
  try {
    const fixture = await env.DB.prepare(
      "SELECT id FROM fixtures WHERE provider = 'api-sports' AND provider_fixture_id = ?",
    ).bind(providerFixtureId).first<{ id: number }>();
    if (!fixture) return json({ error: "fixture_not_found" }, 404);
    const client = providerClient(env);
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

    const result = await client.getOdds({ fixture: providerFixtureId }) as ApiFootballResponse<ProviderOddsFixture[]>;
    counts.requests += 1;
    const records = Array.isArray(result.response) ? result.response : [];
    await storeRaw(env.DB, "odds", result, records.length);
    const observedAt = now();
    for (const fixtureOdds of records) {
      for (const bookmaker of fixtureOdds.bookmakers ?? []) {
        for (const market of bookmaker.bets ?? []) {
          for (const selection of market.values ?? []) {
            const odds = Number(selection.odd);
            if (!selection.value || !Number.isFinite(odds) || odds <= 1) continue;
            await env.DB.prepare(`
              INSERT INTO odds_snapshots
                (fixture_id, bookmaker_provider_id, bookmaker_name, market_provider_id,
                 market_name, selection_name, odds_value, observed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(fixture.id,
              bookmaker.id === undefined ? null : String(bookmaker.id),
              bookmaker.name ?? "Unknown bookmaker",
              market.id === undefined ? null : String(market.id),
              market.name ?? "Unknown market", selection.value, odds, observedAt).run();
            counts.seen++;
            counts.inserted++;
          }
        }
      }
    }
    await recordJob(env.DB, "succeeded", startedAt, "odds", counts);
    return json({
      status: records.length ? "completed" : "no_odds_returned",
      fixtureId: providerFixtureId, bookmakerCount: records.reduce((n, item) => n + (item.bookmakers?.length ?? 0), 0),
      oddsSnapshots: counts.inserted, requestsMade: counts.requests,
      quota: { dailyLimit, used, remaining, safetyReserve: 100 },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    await recordJob(env.DB, "failed", startedAt, "odds", counts, detail).catch(() => undefined);
    return json({ error: "fixture_odds_sync_failed", detail }, 502);
  }
}


async function modelPerformance(env: Env): Promise<Response> {
  try {
    const result = await env.DB.prepare(`
      SELECT mv.model_key, mv.version, COUNT(pe.id) AS evaluated_matches,
        AVG(pe.brier_1x2) AS mean_brier_1x2,
        AVG(pe.log_loss_1x2) AS mean_log_loss_1x2,
        AVG(pe.brier_over_25) AS mean_brier_over_25,
        AVG(pe.brier_btts) AS mean_brier_btts,
        MAX(pe.evaluated_at) AS last_evaluated_at
      FROM model_versions mv
      LEFT JOIN match_predictions mp ON mp.model_version_id = mv.id
      LEFT JOIN prediction_evaluations pe ON pe.prediction_id = mp.id
      GROUP BY mv.id
      ORDER BY mv.created_at DESC
    `).all<Record<string, unknown>>();
    return json({ models: result.results });
  } catch {
    return json({ error: "model_performance_unavailable" }, 503);
  }
}

interface FixtureListRow {
  provider_fixture_id: string;
  kickoff_at: string | null;
  status_short: string | null;
  status_long: string | null;
  elapsed_minutes: number | null;
  home_goals: number | null;
  away_goals: number | null;
  round_name: string | null;
  home_team: string;
  away_team: string;
  competition: string | null;
  country: string | null;
  season_year: number | null;
  probability_home: number | null;
  probability_draw: number | null;
  probability_away: number | null;
  probability_1x: number | null;
  probability_x2: number | null;
  probability_12: number | null;
  probability_over_25: number | null;
  probability_btts_yes: number | null;
  prediction_model: string | null;
}
async function listFixtures(env: Env, date: string, limit: number): Promise<Response> {
  try {
    const result = await env.DB.prepare(`
      SELECT f.provider_fixture_id, f.kickoff_at, f.status_short, f.status_long,
        f.elapsed_minutes, f.home_goals, f.away_goals, f.round_name,
        home.name AS home_team, away.name AS away_team,
        c.name AS competition, co.name AS country, cs.season_year,
        mp.probability_home, mp.probability_draw, mp.probability_away,
        mp.probability_1x, mp.probability_x2, mp.probability_12,
        mp.probability_over_25, mp.probability_btts_yes,
        mv.model_key || '@' || mv.version AS prediction_model
      FROM fixtures f
      JOIN teams home ON home.id = f.home_team_id
      JOIN teams away ON away.id = f.away_team_id
      LEFT JOIN competition_seasons cs ON cs.id = f.competition_season_id
      LEFT JOIN competitions c ON c.id = cs.competition_id
      LEFT JOIN countries co ON co.id = c.country_id
      LEFT JOIN match_predictions mp ON mp.id = (
        SELECT id FROM match_predictions WHERE fixture_id = f.id ORDER BY generated_at DESC LIMIT 1
      )
      LEFT JOIN model_versions mv ON mv.id = mp.model_version_id
      WHERE f.provider = 'api-sports' AND f.kickoff_at >= ? AND f.kickoff_at < ?
      ORDER BY f.kickoff_at ASC
      LIMIT ?
    `).bind(brusselsLocalMidnightUtc(date), brusselsLocalMidnightUtc(nextCalendarDate(date)), limit).all<FixtureListRow>();
    return json({ date, count: result.results.length, fixtures: result.results });
  } catch {
    return json({ error: "fixture_query_failed" }, 503);
  }
}

async function claimPublicSyncSlot(env: Env): Promise<boolean> {
  const current = now();
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO public_sync_gate (id, last_requested_at)
    VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET last_requested_at = excluded.last_requested_at
    WHERE public_sync_gate.last_requested_at <= ?
  `).bind(current, cutoff).run();
  return (result.meta?.changes ?? 0) > 0;
}
async function syncFixturesAndPredictions(env: Env, date: string): Promise<Response> {
  const fixtureResponse = await refreshFixtures(env, date);
  const fixtureResult = await fixtureResponse.json() as Record<string, unknown>;
  if (!fixtureResponse.ok) {
    return json({ status: "failed", stage: "fixtures", date, ...fixtureResult }, fixtureResponse.status);
  }
  const predictionResponse = await generatePredictions(env, date);
  const predictionResult = await predictionResponse.json() as Record<string, unknown>;
  if (!predictionResponse.ok) {
    return json({
      status: "partial", stage: "predictions", date,
      fixtures: fixtureResult, predictions: predictionResult,
    }, 207);
  }
  return json({ status: "completed", date, fixtures: fixtureResult, predictions: predictionResult });
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
    counts.requests += 2;
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
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
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
    if (url.pathname === "/api/predictions/evaluate") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
      }
      return evaluatePredictions(env, date);
    }
    if (url.pathname === "/api/predictions/generate") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
      }
      return generatePredictions(env, date);
    }
    if (url.pathname === "/api/models/performance") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return modelPerformance(env);
    }
    if (url.pathname === "/api/fixtures") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
      }
      const rawLimit = Number(url.searchParams.get("limit") ?? "100");
      const limit = Number.isFinite(rawLimit) ? Math.min(250, Math.max(1, Math.floor(rawLimit))) : 100;
      return listFixtures(env, date, limit);
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
      } catch (error) {
        if (!env.API_FOOTBALL_API_KEY) {
          return json({ error: "provider_secret_not_configured" }, 503);
        }
        if (error instanceof ApiFootballError) {
          const payload = error.providerPayload;
          const providerErrors = payload && typeof payload === "object" && "errors" in payload
            ? (payload as { errors?: unknown }).errors
            : null;
          return json({
            error: "provider_status_unavailable",
            diagnostic: {
              kind: error.status ? "http_error" : "request_error",
              httpStatus: error.status ?? null,
              message: error.message,
              providerErrors,
            },
          }, 503);
        }
        return json({
          error: "provider_status_unavailable",
          diagnostic: {
            kind: "internal_error",
            message: error instanceof Error ? error.message : "unknown_error",
          },
        }, 503);
      }
    }
    if (url.pathname === "/api/fixtures/odds") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const fixtureId = url.searchParams.get("fixture") ?? "";
      if (!/^\d+$/.test(fixtureId)) return json({ error: "invalid_fixture_id" }, 400);
      return refreshFixtureOdds(env, fixtureId);
    }
    if (url.pathname === "/api/fixtures/enrich") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const fixtureId = url.searchParams.get("fixture") ?? "";
      if (!/^\d+$/.test(fixtureId)) return json({ error: "invalid_fixture_id" }, 400);
      return refreshFixtureEnrichment(env, fixtureId);
    }
    if (url.pathname === "/api/fixtures/sync") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "cross_origin_request_rejected" }, 403);
      const fetchSite = request.headers.get("sec-fetch-site");
      if (fetchSite === "cross-site") return json({ error: "cross_origin_request_rejected" }, 403);
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
      }
      try {
        if (!(await claimPublicSyncSlot(env))) {
          return json({ error: "sync_cooldown", detail: "Synchronizacja jest ograniczona do jednego uruchomienia na 2 minuty. Spróbuj ponownie za chwilę.", retryAfterSeconds: 120 }, 429);
        }
        return await syncFixturesAndPredictions(env, date);
      } catch (error) {
        return json({ error: "sync_unavailable", detail: error instanceof Error ? error.message : "unknown_error" }, 503);
      }
    }
    if (url.pathname === "/api/fixtures/refresh") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!env.INGESTION_TOKEN) return json({ error: "ingestion_secret_not_configured" }, 503);
      const authorization = request.headers.get("authorization") ?? "";
      if (!safeEqual(authorization, `Bearer ${env.INGESTION_TOKEN}`)) {
        return json({ error: "unauthorized" }, 401);
      }
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
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
  scheduled(controller: ScheduledControllerLike, env: Env, ctx: ExecutionContextLike): void {
    const task = (async () => {
      const date = brusselsCalendarDate(controller.scheduledTime);
      if (!(await claimPublicSyncSlot(env))) {
        console.log(JSON.stringify({ event: "scheduled_sync_skipped", reason: "cooldown", date }));
        return;
      }
      const response = await syncFixturesAndPredictions(env, date);
      const payload = await response.json() as Record<string, unknown>;
      const result = {
        event: response.ok && payload.status === "completed"
          ? "scheduled_sync_completed"
          : "scheduled_sync_incomplete",
        date,
        httpStatus: response.status,
        result: payload,
      };
      if (result.event === "scheduled_sync_completed") console.log(JSON.stringify(result));
      else console.error(JSON.stringify(result));
    })().catch(error => {
      console.error(JSON.stringify({
        event: "scheduled_sync_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      }));
    });
    ctx.waitUntil(task);
  },
};
