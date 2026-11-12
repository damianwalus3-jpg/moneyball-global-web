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
  const teams = normalize(`${match.home_team ?? ""} ${match.away_team ?? ""}`);
  const countryParts = country.split(/[\\/,;|]+/).map((part) => part.trim()).filter(Boolean);
  if (EUROPE_COUNTRIES.has(country) || countryParts.some((part) => EUROPE_COUNTRIES.has(part) || EUROPE_ISO3.has(part.toUpperCase())) || EUROPE_ISO3.has(String(match.country ?? "").trim().toUpperCase())) return true;
  if (/\buefa\b|european (championship|qualif|league)|uefa nations|uefa champions|uefa europa|uefa conference/.test(competition)) return true;
  if (/\bu20 elite league\b/.test(competition) &&
      /\b(england|italy|portugal|czech republic|germany|france|spain|netherlands|belgium|sweden|norway|denmark|finland|iceland|poland|croatia|serbia|austria|switzerland|scotland|wales|ireland)\b/.test(teams)) return true;
  return false;
}
