import { importScan } from "./scan-import-service";
import { matchKey, type ParsedMatch, type ParsedScan } from "./scan-import";
import type { Match } from "./types";
import { isEuropeanMatch } from "./geography";
import { getSupabase } from "./supabase";

type PublicFixture = {
  fixture_id: string;
  date: string;
  time_local: string | null;
  home_team: string;
  away_team: string;
  competition: string;
  competition_id: string;
  country_code: string;
  gender: "men" | "women" | "mixed" | "unknown";
  source: string;
};
type FixturePayload = { generated_at: string; coverage: { fixture_count: number }; fixtures: PublicFixture[] };

const COUNTRY_NAMES: Record<string, string> = {
  ALB:"Albania", AND:"Andorra", ARM:"Armenia", AUT:"Austria", AZE:"Azerbaijan", BLR:"Belarus", GBR:"United Kingdom", UK:"United Kingdom", NIR:"Northern Ireland",
  BEL:"Belgium", BIH:"Bosnia and Herzegovina", BUL:"Bulgaria", CRO:"Croatia",
  CYP:"Cyprus", CZE:"Czechia", DEN:"Denmark", DNK:"Denmark", ENG:"England",
  EST:"Estonia", FIN:"Finland", FRA:"France", GEO:"Georgia", GER:"Germany", DEU:"Germany",
  GRE:"Greece", GRC:"Greece", HUN:"Hungary", IRE:"Ireland", IRL:"Ireland", ITA:"Italy", ISL:"Iceland", FRO:"Faroe Islands",
  KAZ:"Kazakhstan", NED:"Netherlands", NLD:"Netherlands", NOR:"Norway", LVA:"Latvia", LTU:"Lithuania", MDA:"Moldova",
  POL:"Poland", POR:"Portugal", PRT:"Portugal", ROU:"Romania", RUS:"Russia",
  SCO:"Scotland", SRB:"Serbia", SVK:"Slovakia", SVN:"Slovenia", ESP:"Spain",
  SWE:"Sweden", SUI:"Switzerland", CHE:"Switzerland", MNE:"Montenegro", MKD:"North Macedonia", LUX:"Luxembourg", MLT:"Malta", KOS:"Kosovo", LIE:"Liechtenstein", SMR:"San Marino", GIB:"Gibraltar", TUR:"Turkey",
  UKR:"Ukraine", WAL:"Wales", UEFA:"UEFA",
};
const TIME_ZONES: Record<string, string> = {
  ENG:"Europe/London", SCO:"Europe/London", WAL:"Europe/London", NIR:"Europe/London",
  IRE:"Europe/Dublin", IRL:"Europe/Dublin", POR:"Europe/Lisbon", PRT:"Europe/Lisbon",
  TUR:"Europe/Istanbul", RUS:"Europe/Moscow", UKR:"Europe/Kyiv", CYP:"Asia/Nicosia",
  FIN:"Europe/Helsinki", EST:"Europe/Tallinn", LVA:"Europe/Riga", LTU:"Europe/Vilnius",
  GRE:"Europe/Athens", BUL:"Europe/Sofia", ROU:"Europe/Bucharest", MDA:"Europe/Chisinau",
  GEO:"Asia/Tbilisi", ARM:"Asia/Yerevan", AZE:"Asia/Baku", KAZ:"Asia/Almaty",
  ISL:"Atlantic/Reykjavik", FRO:"Atlantic/Faroe", BLR:"Europe/Minsk",
  ESP:"Europe/Madrid", FRA:"Europe/Paris", GER:"Europe/Berlin", DEU:"Europe/Berlin",
  BEL:"Europe/Brussels", NED:"Europe/Amsterdam", NLD:"Europe/Amsterdam", POL:"Europe/Warsaw",
  AUT:"Europe/Vienna", SUI:"Europe/Zurich", CHE:"Europe/Zurich", CZE:"Europe/Prague",
  SVK:"Europe/Bratislava", SVN:"Europe/Ljubljana", CRO:"Europe/Zagreb", SRB:"Europe/Belgrade",
  HUN:"Europe/Budapest", NOR:"Europe/Oslo", SWE:"Europe/Stockholm", DEN:"Europe/Copenhagen",
  DNK:"Europe/Copenhagen",
  GRC:"Europe/Athens", ALB:"Europe/Tirane", BIH:"Europe/Sarajevo", MNE:"Europe/Podgorica",
  MKD:"Europe/Skopje", KOS:"Europe/Belgrade", MLT:"Europe/Malta", LUX:"Europe/Luxembourg",
};
const DEFAULT_EUROPE_TZ = "Europe/Brussels";

function zonedLocalToIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desired;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += desired - represented;
  }
  return new Date(instant).toISOString();
}

async function loadFixtures(): Promise<FixturePayload> {
  const url = `${import.meta.env.BASE_URL}public-data/fixtures.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nie można pobrać publicznego terminarza GitHub (${response.status}).`);
  const payload = await response.json() as FixturePayload;
  if (!Array.isArray(payload.fixtures)) throw new Error("Nieprawidłowy format publicznego terminarza.");
  return payload;
}

/** Imports verified public fixture rows for one Brussels calendar date; no predictions are fabricated. */
type PublicSourceFixture = {
  kickoff_at: string | null;
  date?: string | null;
  home_team: string;
  away_team: string;
  competition: string;
  country: string;
  gender?: "men" | "women" | "mixed" | "unknown";
  external_id?: string;
  source?: string;
};
type PublicSourcePayload = { ok?: boolean; european_fixtures?: number; fixtures?: PublicSourceFixture[] };

const COUNTRY_ALIASES: Record<string,string> = {
  "the netherlands":"Netherlands", "czech republic":"Czechia", "türkiye":"Turkey",
  "united kingdom":"United Kingdom", "republic of ireland":"Ireland"
};
function normalizeCountry(value:string):string {
  return COUNTRY_NAMES[value.toUpperCase()] || COUNTRY_ALIASES[value.toLowerCase()] || value;
}
function brusselsDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Brussels", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(iso));
}

/** Merges the live multi-source keyless feed with the scheduled GitHub CSV index. */
export async function importPublicFixturesForDate(date: string, existing: Match[]) {
  const candidates = new Map<string, ParsedMatch>();
  const identityKey = (date:string,home:string,away:string,gender?:string|null) => matchKey(null,home,away,date,gender);
  let liveFixtures = 0, staticFixtures = 0, liveErrors = 0;

  // Live no-key sources: OpenMatchday, ESPN public scoreboard, OpenLigaDB,
  // TheSportsDB and BeyondELO. The aggregator reports missing times explicitly.
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.functions.invoke("moneyball-public-sources", { body: { date } });
      if (!error && data?.ok && Array.isArray((data as PublicSourcePayload).fixtures)) {
        for (const f of (data as PublicSourcePayload).fixtures || []) {
          if (!f.home_team || !f.away_team) continue;
          const fixtureDate = (f.date || date).slice(0,10);
          const parsedDate = f.kickoff_at ? new Date(f.kickoff_at) : null;
          if (parsedDate && (!Number.isFinite(parsedDate.getTime()) || brusselsDate(f.kickoff_at!) !== date)) continue;
          if (!parsedDate && fixtureDate !== date) continue;
          const kickoff = parsedDate ? parsedDate.toISOString() : null;
          const row: ParsedMatch = {
            key: matchKey(kickoff, f.home_team, f.away_team, fixtureDate, f.gender),
            kickoff_at: kickoff,
            kickoff_date: fixtureDate,
            league: f.competition || "Nieznane rozgrywki",
            country: f.country ? normalizeCountry(f.country) : null,
            gender: f.gender || "unknown",
            external_id: f.external_id || null,
            source: f.source || "Moneyball public sources",
            home_team: f.home_team,
            away_team: f.away_team,
          };
          if (isEuropeanMatch(row)) {
            const identity = identityKey(fixtureDate,f.home_team,f.away_team,f.gender);
            const prior = candidates.get(identity);
            if (!prior || (!prior.kickoff_at && row.kickoff_at)) candidates.set(identity,row);
          }
        }
        liveFixtures = candidates.size;
      } else if (error) {
        liveErrors++;
      }
    } catch {
      // A rejected Edge Function call must not prevent the independent static
      // GitHub fixture index from filling the scan.
      liveErrors++;
    }
  }

  // Static GitHub feed is an independent fallback and also fills any live-feed gaps.
  try {
    const payload = await loadFixtures();
    for (const f of payload.fixtures.filter(x => x.date === date && x.home_team && x.away_team)) {
      const country = COUNTRY_NAMES[f.country_code] ?? f.country_code;
      const timezone = TIME_ZONES[f.country_code] || DEFAULT_EUROPE_TZ;
      const kickoff = f.time_local ? zonedLocalToIso(f.date, f.time_local, timezone) : null;
      if (kickoff && brusselsDate(kickoff) !== date) continue;
      const row: ParsedMatch = {
        key: matchKey(kickoff, f.home_team, f.away_team, f.date, f.gender),
        kickoff_at: kickoff,
        kickoff_date: f.date,
        league: f.competition,
        country,
        gender: f.gender || "unknown",
        external_id: f.fixture_id,
        source: f.source || "OpenMatchday",
        home_team: f.home_team,
        away_team: f.away_team,
      };
      if (isEuropeanMatch(row)) {
        const identity = identityKey(f.date,f.home_team,f.away_team,f.gender);
        const prior = candidates.get(identity);
        if (!prior || (!prior.kickoff_at && row.kickoff_at)) candidates.set(identity,row);
      }
    }
    staticFixtures = candidates.size - liveFixtures;
  } catch {
    // The live aggregator can still provide a usable scan when GitHub Pages is unavailable.
  }

  const rows = [...candidates.values()];
  if (!rows.length) {
    return { newMatches:0, reusedMatches:0, predictions:0, sourceFixtures:0, liveFixtures, staticFixtures, liveErrors };
  }
  const parsed: ParsedScan = { matches:rows, predictions:[], errors:[] };
  const result = await importScan(parsed, existing, "Moneyball · źródła publiczne bez kluczy");
  return { ...result, sourceFixtures:rows.length, liveFixtures, staticFixtures, liveErrors };
}
