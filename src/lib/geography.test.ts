import { describe, expect, it } from "vitest";
import { isEuropeanMatch } from "./geography";

describe("isEuropeanMatch", () => {
  it("includes European domestic league competitions", () => {
    expect(isEuropeanMatch({ country: "Belgium", league: "First Division A" })).toBe(true);
    expect(isEuropeanMatch({ country: "Turkey", league: "2. Lig" })).toBe(true);
    expect(isEuropeanMatch({ country: "Netherlands", league: "Derde Divisie" })).toBe(true);
    expect(isEuropeanMatch({ country: "Germany/Europe", league: "2. Bundesliga" })).toBe(true);
  });

  it("includes only UEFA Nations League among international competitions", () => {
    expect(isEuropeanMatch({ country: "World", league: "UEFA Nations League" })).toBe(true);
    expect(isEuropeanMatch({ country: "World", league: "UEFA U19 Championship - Qualification" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "UEFA Champions League Women" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "U20 Elite League", home_team: "Italy U20", away_team: "Portugal U20" })).toBe(false);
  });

  it("excludes cups, friendlies, qualifiers and non-European leagues", () => {
    expect(isEuropeanMatch({ country: "France", league: "Coupe de France" })).toBe(false);
    expect(isEuropeanMatch({ country: "England", league: "FA Trophy" })).toBe(false);
    expect(isEuropeanMatch({ country: "Wales", league: "Welsh Cup" })).toBe(false);
    expect(isEuropeanMatch({ country: "Brazil", league: "Serie B" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "Africa Cup of Nations - Qualification" })).toBe(false);
    expect(isEuropeanMatch({ country: "World", league: "Friendlies Clubs", home_team: "Club A", away_team: "Club B" })).toBe(false);
  });
});
