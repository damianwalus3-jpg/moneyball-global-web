import { importScan } from "./scan-import-service";
import { matchKey, type ParsedMatch, type ParsedScan } from "./scan-import";
import type { Match } from "./types";
import { isEuropeanMatch } from "./geography";

type PublicFixture = {
  date: string;
  time_local: string | null;
  home_team: string;
  away_team: string;
  competition: string;
  competition_id: string;
  country_code: string;
  source: string;
};
type FixturePayload = { generated_at: string; coverage: { fixture_count: number }; fixtures: PublicFixture[] };

const COUNTRY_NAMES: Record<string, string> = {
  ALB:"Albania", AND:"Andorra", ARM:"Armenia", AUT:"Austria", AZE:"Azerbaijan",
  BEL:"Belgium", BIH:"Bosnia and Herzegovina", BUL:"Bulgaria", CRO:"Croatia",
  CYP:"Cyprus", CZE:"Czechia", DEN:"Denmark", DNK:"Denmark", ENG:"England",
  EST:"Estonia", FIN:"Finland", FRA:"France", GEO:"Georgia", GER:"Germany",
  GRE:"Greece", HUN:"Hungary", IRE:"Ireland", IRL:"Ireland", ITA:"Italy",
  KAZ:"Kazakhstan", NED:"Netherlands", NLD:"Netherlands", NOR:"Norway",
  POL:"Poland", POR:"Portugal", PRT:"Portugal", ROU:"Romania", RUS:"Russia",
  SCO:"Scotland", SRB:"Serbia", SVK:"Slovakia", SVN:"Slovenia", ESP:"Spain",
  SWE:"Sweden", SUI:"Switzerland", CHE:"Switzerland", TUR:"Turkey",
  UKR:"Ukraine", WAL:"Wales", UEFA:"UEFA",
};
const TIME_ZONES: Record<string, string> = {
  ENG:"Europe/London", SCO:"Europe/London", WAL:"Europe/London", NIR:"Europe/London",
  IRE:"Europe/Dublin", IRL:"Europe/Dublin", POR:"Europe/Lisbon", PRT:"Europe/Lisbon",
  TUR:"Europe/Istanbul", RUS:"Europe/Moscow", UKR:"Europe/Kyiv", CYP:"Asia/Nicosia",
  FIN:"Europe/Helsinki", EST:"Europe/Tallinn", LVA:"Europe/Riga", LTU:"Europe/Vilnius",
  GRE:"Europe/Athens", BUL:"Europe/Sofia", ROU:"Europe/Bucharest", MDA:"Europe/Chisinau",
  GEO:"Asia/Tbilisi", ARM:"Asia/Yerevan", AZE:"Asia/Baku", KAZ:"Asia/Almaty",
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
export async function importPublicFixturesForDate(date: string, existing: Match[]) {
  const payload = await loadFixtures();
  const rows: ParsedMatch[] = payload.fixtures
    .filter(f => f.date === date && f.time_local && f.home_team && f.away_team)
    .map(f => {
      const country = COUNTRY_NAMES[f.country_code] ?? f.country_code;
      const time = f.time_local!;
      const timezone = TIME_ZONES[f.country_code] || DEFAULT_EUROPE_TZ;
      const kickoff = zonedLocalToIso(f.date, time, timezone);
      return {
        key: matchKey(kickoff, f.home_team, f.away_team),
        kickoff_at: kickoff,
        league: f.competition,
        country,
        home_team: f.home_team,
        away_team: f.away_team,
      };
    })
    .filter(isEuropeanMatch);

  if (!rows.length) return { newMatches: 0, reusedMatches: 0, predictions: 0, sourceFixtures: 0, generatedAt: payload.generated_at };
  const parsed: ParsedScan = { matches: rows, predictions: [], errors: [] };
  const result = await importScan(parsed, existing, "OpenMatchday GitHub · terminarz publiczny");
  return { ...result, sourceFixtures: rows.length, generatedAt: payload.generated_at };
}
