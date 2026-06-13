import { describe, expect, it } from "vitest";
import { calculateGroupStandings, type StandingsMatch } from "./standings";

function match(overrides: Partial<StandingsMatch>): StandingsMatch {
  return {
    status: "finished",
    home_team_id: "home",
    away_team_id: "away",
    home_score: 0,
    away_score: 0,
    ...overrides
  };
}

describe("calculateGroupStandings", () => {
  it("calculates and ranks completed group results", () => {
    const standings = calculateGroupStandings([
      match({ home_team_id: "a", away_team_id: "b", home_score: 2, away_score: 0 }),
      match({ home_team_id: "c", away_team_id: "a", home_score: 1, away_score: 1 })
    ]);

    expect(standings).toEqual([
      expect.objectContaining({ teamId: "a", played: 2, won: 1, drawn: 1, points: 4, goalDifference: 2 }),
      expect.objectContaining({ teamId: "c", played: 1, drawn: 1, points: 1 }),
      expect.objectContaining({ teamId: "b", played: 1, lost: 1, points: 0 })
    ]);
  });

  it("ignores unfinished results but can retain their teams for display", () => {
    const standings = calculateGroupStandings(
      [match({ status: "scheduled", home_team_id: "a", away_team_id: "b", home_score: null, away_score: null })],
      { includeTeamsWithoutResults: true }
    );

    expect(standings).toEqual([
      expect.objectContaining({ teamId: "a", played: 0, points: 0 }),
      expect.objectContaining({ teamId: "b", played: 0, points: 0 })
    ]);
  });
});
