import type { OddsSnapshot } from "./types";

export interface ProviderOddsQuote {
  match_id: string;
  bookmaker: string | null;
  mapped_market: string | null;
  mapped_selection: string | null;
  odds: number | string | null;
  captured_at: string | null;
  phase?: string | null;
  suspended?: boolean | null;
}

/** Convert fresh, mapped provider quotes into the shape already used by the match UI. */
export function aggregateProviderOdds(rows: ProviderOddsQuote[]): Map<string, OddsSnapshot> {
  const snapshots = new Map<string, OddsSnapshot>();
  const fieldTimes = new Map<string, string>();
  const fields: Record<string, keyof Pick<OddsSnapshot, "odds_1" | "odds_x" | "odds_2" | "odds_1x" | "odds_x2" | "odds_12">> = {
    "1X2:1": "odds_1",
    "1X2:X": "odds_x",
    "1X2:2": "odds_2",
    "DOUBLE_CHANCE:1X": "odds_1x",
    "DOUBLE_CHANCE:X2": "odds_x2",
    "DOUBLE_CHANCE:12": "odds_12",
  };

  for (const row of rows) {
    if (!row.match_id || row.suspended === true || (row.phase && row.phase !== "prematch")) continue;
    const market = String(row.mapped_market ?? "").toUpperCase();
    const selection = String(row.mapped_selection ?? "").toUpperCase();
    const field = fields[`${market}:${selection}`];
    const price = Number(row.odds);
    if (!field || !Number.isFinite(price) || price <= 1 || price > 1000) continue;

    const capturedAt = row.captured_at ?? "";
    let snapshot = snapshots.get(row.match_id);
    if (!snapshot) {
      snapshot = {
        id: `provider-${row.match_id}`,
        match_id: row.match_id,
        bookmaker: row.bookmaker,
        captured_at: capturedAt || null,
        odds_1: null,
        odds_x: null,
        odds_2: null,
        odds_1x: null,
        odds_x2: null,
        odds_12: null,
        created_at: capturedAt || null,
      };
      snapshots.set(row.match_id, snapshot);
    }
    if (capturedAt > (snapshot.captured_at ?? "")) {
      snapshot.captured_at = capturedAt;
      snapshot.bookmaker = row.bookmaker;
    }

    const key = `${row.match_id}:${field}`;
    if (capturedAt >= (fieldTimes.get(key) ?? "")) {
      snapshot[field] = price;
      fieldTimes.set(key, capturedAt);
    }
  }
  return snapshots;
}
