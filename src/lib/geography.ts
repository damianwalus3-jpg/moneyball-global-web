export interface EuropeanMatchFields {
  country?: string | null;
  league?: string | null;
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

/** Europe-only scope. UEFA competitions remain included even when providers label their country as "World". */
export function isEuropeanMatch(match: EuropeanMatchFields): boolean {
  const country = normalize(match.country);
  const competition = normalize(match.league);
  const rawCountryParts = String(match.country ?? "").split(/[\/,;|]+/).map(normalize).filter(Boolean);
  const isEurope = EUROPE_COUNTRIES.has(country) ||
    rawCountryParts.some((part) => EUROPE_COUNTRIES.has(part) || EUROPE_ISO3.has(part.toUpperCase())) ||
    EUROPE_ISO3.has(String(match.country ?? "").trim().toUpperCase());

  if (/\b(nations league|uefa nations league)\b/.test(competition)) return true;
  if (!isEurope) return false;
  if (/\b(cup|copa|trophy|shield|friendly|friendlies|qualif|qualifier|champions league|europa league|conference league|world cup|super cup|play off|playoff)\b/.test(competition)) return false;
  return /\b(league|liga|ligue|lig|divisie|lyga|virsliga|meistriliiga|klasse|deild|besta deild|campeonato|oberliga|regionalliga|verbandsliga|landesliga|superettan|veikkausliiga|esiliiga|ykkosliiga|serie|division|div|premier|bundesliga|eredivisie|ekstraklasa|allsvenskan|eliteserien|superliga|premiership|championship|pro league|jupiler|prva liga|national league|1 hnl|2 hnl)\b/.test(competition);
}
