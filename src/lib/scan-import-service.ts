import { insertRow, insertRows, updateRow } from "./db";
import { matchKey, type ParsedScan } from "./scan-import";
import type { Match } from "./types";
import { isEuropeanMatch } from "./geography";

/**
 * Stores a parsed scan: one scan_run, every match (reusing identical existing
 * matches), and every prediction including ODRZUCONY ones.
 */
export async function importScan(parsed: ParsedScan, existing: Match[], source: string) {
  if (parsed.errors.length) throw new Error("Popraw błędy w pliku przed importem.");
  if (parsed.matches.length === 0) throw new Error("Plik nie zawiera meczów.");

  const europeanMatches = parsed.matches.filter(isEuropeanMatch);
  const nonEuropeanKeys = new Set(parsed.matches.filter((m) => !isEuropeanMatch(m)).map((m) => m.key));
  const europeanPredictions = parsed.predictions.filter((p) => !nonEuropeanKeys.has(p.matchKey));
  if (europeanMatches.length === 0) throw new Error("Import przerwany: plik nie zawiera meczów z Europy.");

  const scan = await insertRow("scan_runs", {
    started_at: new Date().toISOString(),
    source: source.trim() || "import CSV",
    matches_count: europeanMatches.length,
  });

  const existingByKey = new Map<string, Match>();
  for (const m of existing)
    if (isEuropeanMatch(m) && m.kickoff_at && m.home_team && m.away_team)
      existingByKey.set(matchKey(new Date(m.kickoff_at).toISOString(), m.home_team, m.away_team), m);

  const idByKey = new Map<string, string>();
  const toInsert = europeanMatches.filter((m) => {
    const e = existingByKey.get(m.key);
    if (e) idByKey.set(m.key, e.id);
    return !e;
  });

  const inserted = await insertRows(
    "matches",
    toInsert.map((m) => ({
      scan_run_id: scan.id,
      kickoff_at: m.kickoff_at,
      league: m.league,
      country: m.country,
      gender: m.gender ?? "unknown",
      home_team: m.home_team,
      away_team: m.away_team,
      status: "scheduled",
    })),
  );
  for (const m of inserted)
    idByKey.set(matchKey(new Date(m.kickoff_at!).toISOString(), m.home_team!, m.away_team!), m.id);

  const preds = europeanPredictions.map((p) => {
    const match_id = idByKey.get(p.matchKey);
    if (!match_id) throw new Error("Nie udało się powiązać prognozy z meczem.");
    return {
      match_id,
      scan_run_id: scan.id,
      prediction_type: p.prediction_type,
      pick: p.pick,
      probability: p.probability,
      odds: p.odds,
      confidence: p.confidence,
      selection_status: p.selection_status,
      rejection_reason: p.rejection_reason,
      result_status: "pending",
    };
  });
  for (let i = 0; i < preds.length; i += 500) await insertRows("predictions", preds.slice(i, i + 500));

  await updateRow("scan_runs", scan.id, { matches_count: europeanMatches.length });
  return {
    newMatches: inserted.length,
    reusedMatches: europeanMatches.length - inserted.length,
    ignoredNonEuropean: nonEuropeanKeys.size,
    predictions: preds.length,
  };
}
