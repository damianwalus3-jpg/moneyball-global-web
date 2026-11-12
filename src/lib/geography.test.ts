import { describe, expect, it } from "vitest";
import { isEuropeanMatch } from "./geography";

describe("isEuropeanMatch", () => {
  it("includes European domestic competitions", () => {
    expect(isEuropeanMatch({ country: "Belgium", league: "First Division A" })).toBe(true);
    expect(isEuropeanMatch({ country: "ESP", league: "Copa del Rey" })).toBe(true);
    expect(isEuropeanMatch({ country: "Germany/Europe", league: "OpenLigaDB" })).toBe(true);
  });

  it("keeps UEFA competitions even when the provider says World", () => {
    expect(isEuropeanMatch({ country: "World", league: "UEFA Nations League" })).toBe(true);
    expect(isEuropeanMatch({ country: "World", league: "UEFA U19 Championship - Qualification" })).toBe(true);
    expect(isEuropeanMatch({ country: "World", league: "UEFA Champions League Women" })).toBe(true);
  });

  it("keeps European U20 Elite League fixtures", () => {
    expect(isEuropeanMatch({
      country: "World",
      league: "U20 Elite League",
      home_team: "Italy U20",
      away_team: "Portugal U20",
    })).toBe(true);
  });

  it("excludes matches from other continents and unidentified global friendlies", () => {
    expect(isEuropeanMatch({ country: "Brazil", league: "Serie B" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "Africa Cup of Nations - Qualification" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "Friendlies Clubs", home_team: "Club A", away_team: "Club B" })).toBe(false);
  });
});
