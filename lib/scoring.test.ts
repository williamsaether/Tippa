import { describe, expect, it } from "vitest";
import {
  calculateExactScoreResult,
  calculateGroupTablePoints,
  calculateOutcomePoints,
  knockoutPointsForRound,
  scoringPresets
} from "./scoring";

const finished = { status: "finished" as const };

describe("group table scoring", () => {
  it("scores exact positions only by default", () => {
    expect(
      calculateGroupTablePoints(["a", "b", "c", "d"], ["a", "b", "c", "d"], 2)
    ).toBe(4);
  });

  it("does not award default points for correct advancing teams in wrong order", () => {
    expect(
      calculateGroupTablePoints(["b", "a", "c", "d"], ["a", "b", "c", "d"], 2)
    ).toBe(2);
  });

  it("scores lower when qualifiers are wrong", () => {
    expect(
      calculateGroupTablePoints(["c", "d", "a", "b"], ["a", "b", "c", "d"], 2)
    ).toBe(0);
  });

  it("supports best third-place advancement in table mode", () => {
    expect(
      calculateGroupTablePoints(["a", "b", "c", "d"], ["a", "b", "c", "d"], {
        actualAdvancingTeamIds: ["a", "b", "c"],
        predictedThirdPlaceAdvances: true
      })
    ).toBe(4);
  });

  it("does not add default status points for third-place advancement", () => {
    expect(
      calculateGroupTablePoints(["a", "b", "c", "d"], ["a", "b", "c", "d"], {
        actualAdvancingTeamIds: ["a", "b", "c"],
        predictedThirdPlaceAdvances: false
      })
    ).toBe(4);
  });
});

describe("match prediction scoring", () => {
  it.each([
    ["home", 2, 1, 2],
    ["draw", 1, 1, 2],
    ["away", 0, 2, 2],
    ["home", 1, 1, 0]
  ] as const)("scores %s prediction for %i-%i", (prediction, homeScore, awayScore, expected) => {
    expect(
      calculateOutcomePoints(prediction, {
        ...finished,
        homeScore,
        awayScore
      })
    ).toBe(expected);
  });

  it.each([
    [2, 1, 2, 1, 4],
    [2, 1, 1, 0, 3],
    [2, 1, 3, 2, 3],
    [2, 1, 1, 1, 0],
    [1, 1, 0, 0, 3],
    [1, 1, 1, 1, 4]
  ])("scores actual %i-%i predicted %i-%i", (ah, aa, ph, pa, expected) => {
    expect(
      calculateExactScoreResult(
        { homeScore: ph, awayScore: pa },
        { ...finished, homeScore: ah, awayScore: aa }
      ).points
    ).toBe(expected);
  });
});

describe("knockout scoring", () => {
  it("uses balanced round weights by default", () => {
    expect(knockoutPointsForRound("round_of_32")).toBe(1);
    expect(knockoutPointsForRound("round_of_16")).toBe(2);
    expect(knockoutPointsForRound("quarter_final")).toBe(4);
    expect(knockoutPointsForRound("semi_final")).toBe(8);
    expect(knockoutPointsForRound("final")).toBe(16);
    expect(knockoutPointsForRound("third_place")).toBe(4);
  });

  it("supports high-stakes champion weighting", () => {
    expect(knockoutPointsForRound("final", scoringPresets.high_stakes)).toBe(32);
  });
});
