import { describe, expect, it } from "vitest";
import { buildKnockoutBracket } from "./knockout-bracket";

type TestMatch = Parameters<typeof buildKnockoutBracket>[0]["groupMatches"][number];

function groupMatch(group: string, home: string, away: string): TestMatch {
  return {
    id: `${group}-${home}-${away}`,
    external_id: null,
    stage_type: "group",
    round_key: "group",
    round_order: 0,
    group_name: `Group ${group}`,
    home_team_id: home,
    away_team_id: away,
    home_team_name: home.toUpperCase(),
    away_team_name: away.toUpperCase(),
    kickoff_time: null,
    status: "scheduled",
    home_score: null,
    away_score: null
  };
}

function knockoutMatch(overrides: Partial<TestMatch>): TestMatch {
  return {
    id: "match-74",
    external_id: "2026-round-of-32-match-74",
    stage_type: "knockout",
    round_key: "round_of_32",
    round_order: 1,
    group_name: null,
    home_team_id: "e1",
    away_team_id: "placeholder",
    home_team_name: "Germany",
    away_team_name: "3A/B/C/D/F",
    kickoff_time: null,
    status: "scheduled",
    home_score: null,
    away_score: null,
    ...overrides
  };
}

describe("buildKnockoutBracket", () => {
  it("replaces stored seed placeholders with resolved bracket teams", () => {
    const groupMatches = ["B", "D", "E", "F", "I", "J", "K", "L"].flatMap((group) => [
      groupMatch(group, `${group.toLowerCase()}1`, `${group.toLowerCase()}2`),
      groupMatch(group, `${group.toLowerCase()}2`, `${group.toLowerCase()}3`)
    ]);

    const bracket = buildKnockoutBracket({
      knockoutMatches: [
        knockoutMatch({
          id: "match-73",
          external_id: "source-73",
          home_team_name: "South Africa",
          away_team_name: "Canada"
        }),
        knockoutMatch({})
      ],
      groupMatches,
      includeThirdPlace: false
    });

    const match = bracket[0].matches[1];
    expect(match.slots[0].team?.name).toBe("Germany");
    expect(match.slots[1].team).toEqual(
      expect.objectContaining({
        id: "d3",
        name: "D3",
        seed: "3D"
      })
    );
  });

  it("does not use a parsed external id match number from the wrong round", () => {
    const bracket = buildKnockoutBracket({
      knockoutMatches: [
        knockoutMatch({
          id: "real-quarter-final",
          external_id: "bad-source-89",
          round_key: "quarter_final",
          round_order: 3
        })
      ],
      groupMatches: [],
      includeThirdPlace: false
    });

    expect(bracket.find((round) => round.roundKey === "round_of_16")).toBeUndefined();
    expect(bracket.find((round) => round.roundKey === "quarter_final")).toBeUndefined();
  });

  it("uses the row with the exact expected match number inside each round", () => {
    const bracket = buildKnockoutBracket({
      knockoutMatches: [
        knockoutMatch({
          id: "first-quarter-row",
          external_id: "bad-source-89",
          round_key: "quarter_final",
          round_order: 3
        }),
        knockoutMatch({
          id: "second-quarter-row",
          external_id: "source-97",
          round_key: "quarter_final",
          round_order: 3
        })
      ],
      groupMatches: [],
      includeThirdPlace: false
    });

    expect(bracket.find((round) => round.roundKey === "quarter_final")?.matches[0]).toEqual(
      expect.objectContaining({
        matchNumber: 97,
        sourceMatchId: "second-quarter-row"
      })
    );
  });

  it("keeps every bracket match tied to a fixture from the same round", () => {
    const knockoutMatches = [
      ...Array.from({ length: 16 }, (_, index) =>
        knockoutMatch({
          id: `round-of-32-${index}`,
          external_id: `source-${73 + index}`,
          round_key: "round_of_32",
          round_order: 1
        })
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        knockoutMatch({
          id: `round-of-16-${index}`,
          external_id: `source-${89 + index}`,
          round_key: "round_of_16",
          round_order: 2
        })
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        knockoutMatch({
          id: `quarter-${index}`,
          external_id: `source-${97 + index}`,
          round_key: "quarter_final",
          round_order: 3
        })
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        knockoutMatch({
          id: `semi-${index}`,
          external_id: `source-${101 + index}`,
          round_key: "semi_final",
          round_order: 4
        })
      ),
      knockoutMatch({
        id: "third-place",
        external_id: "source-103",
        round_key: "third_place",
        round_order: 5
      }),
      knockoutMatch({
        id: "final",
        external_id: "source-104",
        round_key: "final",
        round_order: 6
      })
    ];
    const sourceRoundById = new Map(knockoutMatches.map((match) => [match.id, match.round_key]));

    const bracket = buildKnockoutBracket({
      knockoutMatches,
      groupMatches: [],
      includeThirdPlace: true
    });

    for (const round of bracket) {
      for (const match of round.matches) {
        expect(sourceRoundById.get(match.sourceMatchId)).toBe(match.roundKey);
      }
    }
  });
});
