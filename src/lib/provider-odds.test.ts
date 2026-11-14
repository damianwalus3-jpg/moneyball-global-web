import { describe, expect, it } from "vitest";
import { aggregateProviderOdds } from "./provider-odds";

describe("aggregateProviderOdds", () => {
  it("maps current 1X2 and Double Chance provider quotes to match display odds", () => {
    const result = aggregateProviderOdds([
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "1", odds: "2.40", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "X", odds: "3.30", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "2", odds: "2.90", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "DOUBLE_CHANCE", mapped_selection: "1X", odds: "1.40", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "DOUBLE_CHANCE", mapped_selection: "X2", odds: "1.53", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "DOUBLE_CHANCE", mapped_selection: "12", odds: "1.33", captured_at: "2026-11-14T16:00:00Z", phase: "prematch", suspended: false },
    ]);
    expect(result.get("m1")).toMatchObject({
      bookmaker: "bet365", odds_1: 2.4, odds_x: 3.3, odds_2: 2.9,
      odds_1x: 1.4, odds_x2: 1.53, odds_12: 1.33,
    });
  });

  it("keeps the newest quote per selection and ignores suspended, live, goals and invalid prices", () => {
    const result = aggregateProviderOdds([
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "1", odds: 2.1, captured_at: "2026-11-14T15:00:00Z" },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "1", odds: 2.2, captured_at: "2026-11-14T16:00:00Z" },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "X", odds: 3.0, captured_at: "2026-11-14T16:00:00Z", suspended: true },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "GOALS", mapped_selection: "OVER_2.5", odds: 1.8, captured_at: "2026-11-14T16:00:00Z" },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "2", odds: 1, captured_at: "2026-11-14T16:00:00Z" },
      { match_id: "m1", bookmaker: "bet365", mapped_market: "1X2", mapped_selection: "X", odds: 3.2, captured_at: "2026-11-14T16:00:00Z", phase: "live" },
    ]);
    expect(result.get("m1")?.odds_1).toBe(2.2);
    expect(result.get("m1")?.odds_x).toBeNull();
    expect(result.get("m1")?.odds_2).toBeNull();
  });
});
