import { describe, expect, it } from "vitest";
import {
  classifyRound,
  externalIdFor,
  isPlaceholderTeam
} from "./openfootball-worldcup-2026";

describe("openFootballWorldCup2026Adapter helpers", () => {
  it("classifies knockout rounds without treating quarter/semi finals as the final", () => {
    expect(classifyRound({ round: "Quarter-final" })).toMatchObject({
      stageType: "knockout",
      roundKey: "quarter_final",
      roundOrder: 3
    });
    expect(classifyRound({ round: "Semi-final" })).toMatchObject({
      stageType: "knockout",
      roundKey: "semi_final",
      roundOrder: 4
    });
    expect(classifyRound({ round: "Final" })).toMatchObject({
      stageType: "knockout",
      roundKey: "final",
      roundOrder: 6
    });
  });

  it("uses stable match numbers for knockout external ids", () => {
    expect(
      externalIdFor({ num: 74, round: "Round of 32", team1: "Germany", team2: "Paraguay" }, 73)
    ).toBe("world-cup-2026-match-74");
    expect(
      externalIdFor({ num: 74, round: "Round of 32", team1: "1E", team2: "3A/B/C/D/F" }, 73)
    ).toBe("world-cup-2026-match-74");
  });

  it("treats seed and winner placeholders as placeholders", () => {
    expect(isPlaceholderTeam("1E")).toBe(true);
    expect(isPlaceholderTeam("3A/B/C/D/F")).toBe(true);
    expect(isPlaceholderTeam("W89")).toBe(true);
    expect(isPlaceholderTeam("L101")).toBe(true);
    expect(isPlaceholderTeam("Germany")).toBe(false);
  });
});
