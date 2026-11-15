export interface EuropeanMatchFields {
  country?: string | null;
  league?: string | null;
  competition?: string | null;
  home_team?: string | null;
  away_team?: string | null;
}

const EUROPE_COUNTRIES = new Set([
  "albania","andorra","armenia","austria","azerbaijan","belarus","belgium",
  "bosnia and herzegovina","bulgaria","croatia","cyprus","czechia","czech republic",
  "denmark","england","estonia","faroe islands","finland","france","georgia","germany",
  "gibraltar","greece","hungary","iceland","ireland","isle of man","italy","kazakhstan",
  "kosovo","latvia","liechtenstein","lithuania","luxembourg","malta","moldova","monaco",
  "montenegro","netherlands","north macedonia","northern ireland","norway","poland",
  "portugal","romania","russia","san marino","scotland","serbia","slovakia","slovenia",
  "spain","sweden","switzerland","turkey","türkiye","ukraine","wales","united kingdom",
  "uk","europe","uefa",
]);
const EUROPE_ISO3 = new Set([
  "ALB","AND","ARM","AUT","AZE","BLR","BEL","BIH","BUL","CRO","CYP","CZE","DNK",
  "ENG","EST","FRO","FIN","FRA","GEO","DEU","GER","GIB","GRC","GRE","HUN","ISL",
  "IRL","ITA","KAZ","KOS","LVA","LIE","LTU","LUX","MLT","MDA","MNE","NLD","MKD",
  "NIR","NOR","POL","PRT","POR","ROU","RUS","SMR","SCO","SRB","SVK","SVN","ESP",
  "SWE","CHE","SUI","TUR","UKR","WAL","GBR","UK",
]);

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Keep only national senior top-flight and second-tier league competitions. */
export function isTopTwoTierLeague(match: EuropeanMatchFields): boolean {
  const competition = normalize(match.competition || match.league);
  if (!competition) return false;
  if (/\b(u(?:17|18|19|20|21|23)|under ?(?:17|18|19|20|21|23)|youth|junior(?:s)?|academy|juvenil|jugend|reserve|reserves|b team|ii team)\b/.test(competition)) return false;
  // Explicit third tier and below always lose, even if the provider calls them "League".
  if (/\b(?:3|4|5|6|7|8|9|iii|iv|v|vi)\s*(?:\.\s*)?(?:liga|league|division|div|bundesliga|serie|snl|hnl|federal|federation)\b|\b(?:third|fourth|fifth|regional|regionalliga|oberliga|national league north|national league south|national league|league one|league two|non league|non-league)\b/.test(competition)) return false;
  // Recognized first/second divisions across European naming conventions.
  return /\b(?:premier league|premiership|championship|super league|superliga|super lig|pro league|jupiler pro league|challenger pro league|bundesliga|2 bundesliga|ligue 1|ligue 2|serie a|serie b|la liga|laliga|segunda division|segunda liga|eredivisie|keuken kampioen divisie|primeira liga|segunda liga|ekstraklasa|1 lig|2 lig|1 liga|2 liga|liga i|liga ii|liga 1|liga 2|prva liga|prva hrvatska|hnl|1 hnl|2 hnl|first league|second league|first division|second division|division 1|division 2|div 1|div 2|1st division|2nd division|1st league|2nd league|1 liga|2 liga|a lyga|virsliga|meistriliiga|veikkausliiga|ykkosliiga|allsvenskan|superettan|eliteserien|obos ligaen|premier division|league of ireland premier|league of ireland first|scottish championship)\b/.test(competition);
}

/** Europe-only scope. UEFA competitions remain included even when providers label their country as "World". */
export function isEuropeanMatch(match: EuropeanMatchFields): boolean {
  const country = normalize(match.country);
  const competition = normalize(match.competition || match.league);
  const rawCountryParts = String(match.country ?? "").split(/[\/,;|]+/).map(normalize).filter(Boolean);
  const isEurope = EUROPE_COUNTRIES.has(country) ||
    rawCountryParts.some((part) => EUROPE_COUNTRIES.has(part) || EUROPE_ISO3.has(part.toUpperCase())) ||
    EUROPE_ISO3.has(String(match.country ?? "").trim().toUpperCase());

  if (/\b(nations league|uefa nations league)\b/.test(competition)) return true;
  // Exclude youth competitions; adult reserve/U23 clubs in ordinary domestic leagues remain eligible.
  if (/\b(u(?:17|18|19|20|21|23)|under ?(?:17|18|19|20|21|23)|youth|junior(?:s)?|academy|juvenil|jugend)\b/.test(competition)) return false;
  if (!isEurope) return false;
  if (!isTopTwoTierLeague({ ...match, competition })) return false;
  if (/\b(cup|copa|trophy|shield|friendly|friendlies|qualif|qualifier|champions league|europa league|conference league|world cup|super cup|play off|playoff)\b/.test(competition)) return false;
  return /\b(league|liga|ligue|lig|divisie|lyga|virsliga|meistriliiga|klasse|deild|besta deild|campeonato|oberliga|regionalliga|verbandsliga|landesliga|superettan|veikkausliiga|esiliiga|ykkosliiga|kakkonen|serie|division|div|premier|bundesliga|eredivisie|ekstraliga|allsvenskan|damallsvenskan|eliteserien|elitettan|toppserien|ettan|kvindeliga|frauenliga|superliga|premiership|championship|pro league|jupiler|prva liga|1 hnl|2 hnl|gamma ethniki|fa wsl|nb\s?(?:ii|iii|2|3)|[23]\s*snl)\b/.test(competition);
}
