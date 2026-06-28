import { flagForTeam } from "./team-flags";
import { calculateGroupStandings, type StandingsMatch } from "./tournaments/standings";

export type KnockoutRoundKey =
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

export type KnockoutBracketTeam = {
  id: string;
  name: string;
  flag: string;
  seed?: string;
};

export type KnockoutBracketSource = {
  result: "winner" | "loser";
  matchNumber: number;
};

export type KnockoutBracketSlot = {
  label: string;
  team: KnockoutBracketTeam | null;
  source?: KnockoutBracketSource;
};

export type KnockoutBracketMatch = {
  matchNumber: number;
  roundKey: KnockoutRoundKey;
  slotIndex: number;
  sourceMatchId: string;
  title: string;
  slots: [KnockoutBracketSlot, KnockoutBracketSlot];
};

export type KnockoutBracketRound = {
  roundKey: KnockoutRoundKey;
  title: string;
  matches: KnockoutBracketMatch[];
};

export type KnockoutPickState = Record<number, KnockoutBracketTeam>;

type MatchRow = StandingsMatch & {
  id: string;
  external_id?: string | null;
  stage_type: "group" | "knockout";
  round_key: string;
  round_order: number;
  group_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string;
  away_team_name: string;
  kickoff_time: string | null;
  updated_at?: string | null;
};

const roundTitles: Record<KnockoutRoundKey, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarterfinals",
  semi_final: "Semifinals",
  third_place: "Third place",
  final: "Final"
};

const roundOrder: KnockoutRoundKey[] = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
  "third_place"
];

const roundMatchNumbers: Record<KnockoutRoundKey, number[]> = {
  round_of_32: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
  round_of_16: [89, 90, 91, 92, 93, 94, 95, 96],
  quarter_final: [97, 98, 99, 100],
  semi_final: [101, 102],
  third_place: [103],
  final: [104]
};

const roundOf32Seeds: Record<number, [string, string]> = {
  73: ["2A", "2B"],
  74: ["1E", "3A/B/C/D/F"],
  75: ["1F", "2C"],
  76: ["1C", "2F"],
  77: ["1I", "3C/D/F/G/H"],
  78: ["2E", "2I"],
  79: ["1A", "3C/E/F/H/I"],
  80: ["1L", "3E/H/I/J/K"],
  81: ["1D", "3B/E/F/I/J"],
  82: ["1G", "3A/E/H/I/J"],
  83: ["2K", "2L"],
  84: ["1H", "2J"],
  85: ["1B", "3E/F/G/I/J"],
  86: ["1J", "2H"],
  87: ["1K", "3D/E/I/J/L"],
  88: ["2D", "2G"]
};

const laterRoundSources: Record<number, [KnockoutBracketSource, KnockoutBracketSource]> = {
  89: [winnerOf(74), winnerOf(77)],
  90: [winnerOf(73), winnerOf(75)],
  91: [winnerOf(76), winnerOf(78)],
  92: [winnerOf(79), winnerOf(80)],
  93: [winnerOf(83), winnerOf(84)],
  94: [winnerOf(81), winnerOf(82)],
  95: [winnerOf(86), winnerOf(88)],
  96: [winnerOf(85), winnerOf(87)],
  97: [winnerOf(89), winnerOf(90)],
  98: [winnerOf(93), winnerOf(94)],
  99: [winnerOf(91), winnerOf(92)],
  100: [winnerOf(95), winnerOf(96)],
  101: [winnerOf(97), winnerOf(98)],
  102: [winnerOf(99), winnerOf(100)],
  103: [loserOf(101), loserOf(102)],
  104: [winnerOf(101), winnerOf(102)]
};

const knownThirdPlaceAssignments: Record<string, Record<number, string>> = {
  BDEFIJKL: {
    74: "D",
    77: "F",
    79: "E",
    80: "K",
    81: "B",
    82: "I",
    85: "J",
    87: "L"
  }
};

function winnerOf(matchNumber: number): KnockoutBracketSource {
  return { result: "winner", matchNumber };
}

function loserOf(matchNumber: number): KnockoutBracketSource {
  return { result: "loser", matchNumber };
}

function groupLetter(groupName: string | null) {
  if (!groupName) return null;
  const match = groupName.match(/([A-L])$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function knockoutMatchNumber(match: Pick<MatchRow, "external_id">) {
  const externalId = match.external_id ?? "";
  const trailingNumber = externalId.match(/(?:^|-)(\d+)$/);
  return trailingNumber ? Number(trailingNumber[1]) : null;
}

function isPlaceholderTeamName(name: string) {
  return /^(?:TBD|[WL]\d+|[123][A-L](?:\/[A-L])*)$/i.test(name.trim());
}

function teamFromFixture(
  match: MatchRow,
  side: "home" | "away",
  seed: string
): KnockoutBracketTeam | null {
  const id = side === "home" ? match.home_team_id : match.away_team_id;
  const name = side === "home" ? match.home_team_name : match.away_team_name;
  if (!id || !name || isPlaceholderTeamName(name)) return null;
  return { id, name, flag: flagForTeam(name), seed };
}

function buildGroupTables(groupMatches: MatchRow[]) {
  const matchesByGroup = new Map<string, MatchRow[]>();
  const teamNames = new Map<string, string>();

  for (const match of groupMatches) {
    if (!match.group_name) continue;
    const letter = groupLetter(match.group_name);
    if (!letter) continue;
    matchesByGroup.set(letter, [...(matchesByGroup.get(letter) ?? []), match]);
    if (match.home_team_id && match.home_team_name !== "TBD") {
      teamNames.set(match.home_team_id, match.home_team_name);
    }
    if (match.away_team_id && match.away_team_name !== "TBD") {
      teamNames.set(match.away_team_id, match.away_team_name);
    }
  }

  const standingsByGroup = new Map<string, ReturnType<typeof calculateGroupStandings>>();
  for (const [letter, matches] of matchesByGroup) {
    standingsByGroup.set(letter, calculateGroupStandings(matches, { includeTeamsWithoutResults: true }));
  }

  return { standingsByGroup, teamNames };
}

function rankedTeam(
  seed: string,
  standingsByGroup: Map<string, ReturnType<typeof calculateGroupStandings>>,
  teamNames: Map<string, string>
): KnockoutBracketTeam | null {
  const directSeed = seed.match(/^([12])([A-L])$/);
  if (!directSeed) return null;
  const row = standingsByGroup.get(directSeed[2])?.[Number(directSeed[1]) - 1];
  if (!row) return null;
  const name = teamNames.get(row.teamId);
  return name ? { id: row.teamId, name, flag: flagForTeam(name), seed } : null;
}

function bestThirdGroups(standingsByGroup: Map<string, ReturnType<typeof calculateGroupStandings>>) {
  return [...standingsByGroup.entries()]
    .map(([group, standings]) => ({ group, row: standings[2] }))
    .filter((entry): entry is { group: string; row: NonNullable<(typeof entry)["row"]> } =>
      Boolean(entry.row)
    )
    .sort(
      (a, b) =>
        b.row.points - a.row.points ||
        b.row.goalDifference - a.row.goalDifference ||
        b.row.goalsFor - a.row.goalsFor ||
        a.row.teamId.localeCompare(b.row.teamId)
    )
    .slice(0, 8)
    .map((entry) => entry.group)
    .sort();
}

function candidateGroups(seed: string) {
  return seed.replace(/^3/, "").split("/");
}

function fallbackThirdPlaceAssignments(groups: string[]) {
  const used = new Set<string>();
  const assignments: Record<number, string> = {};
  const slots = Object.entries(roundOf32Seeds)
    .filter(([, seeds]) => seeds.some((seed) => seed.startsWith("3")))
    .map(([matchNumber, seeds]) => ({
      matchNumber: Number(matchNumber),
      candidates: candidateGroups(seeds.find((seed) => seed.startsWith("3")) as string).filter((group) =>
        groups.includes(group)
      )
    }))
    .sort((left, right) => left.candidates.length - right.candidates.length || left.matchNumber - right.matchNumber);

  for (const slot of slots) {
    const group = slot.candidates.find((candidate) => !used.has(candidate));
    if (!group) continue;
    assignments[slot.matchNumber] = group;
    used.add(group);
  }

  return assignments;
}

function thirdPlaceAssignments(groups: string[]) {
  const key = [...groups].sort().join("");
  return knownThirdPlaceAssignments[key] ?? fallbackThirdPlaceAssignments(groups);
}

function thirdPlaceTeam(
  matchNumber: number,
  seed: string,
  standingsByGroup: Map<string, ReturnType<typeof calculateGroupStandings>>,
  teamNames: Map<string, string>,
  thirdAssignments: Record<number, string>
): KnockoutBracketTeam | null {
  const assignedGroup = thirdAssignments[matchNumber];
  if (!assignedGroup || !candidateGroups(seed).includes(assignedGroup)) return null;
  const row = standingsByGroup.get(assignedGroup)?.[2];
  if (!row) return null;
  const name = teamNames.get(row.teamId);
  return name ? { id: row.teamId, name, flag: flagForTeam(name), seed: `3${assignedGroup}` } : null;
}

function seedTeam(
  matchNumber: number,
  seed: string,
  standingsByGroup: Map<string, ReturnType<typeof calculateGroupStandings>>,
  teamNames: Map<string, string>,
  thirdAssignments: Record<number, string>
) {
  return seed.startsWith("3")
    ? thirdPlaceTeam(matchNumber, seed, standingsByGroup, teamNames, thirdAssignments)
    : rankedTeam(seed, standingsByGroup, teamNames);
}

function sourceLabel(source: KnockoutBracketSource) {
  return `${source.result === "winner" ? "W" : "L"}${source.matchNumber}`;
}

function sortedMatches(matches: MatchRow[]) {
  return [...matches].sort((left, right) => {
    const leftNumber = knockoutMatchNumber(left) ?? 0;
    const rightNumber = knockoutMatchNumber(right) ?? 0;
    return (
      left.round_order - right.round_order ||
      leftNumber - rightNumber ||
      (left.kickoff_time ?? "").localeCompare(right.kickoff_time ?? "")
    );
  });
}

function resolvedTeamScore(name: string) {
  return isPlaceholderTeamName(name) ? 0 : 1;
}

function candidateScore(match: MatchRow, matchNumber: number) {
  return (
    (match.external_id === `world-cup-2026-match-${matchNumber}` ? 100 : 0) +
    resolvedTeamScore(match.home_team_name) * 10 +
    resolvedTeamScore(match.away_team_name) * 10
  );
}

function assignRoundMatches(roundKey: KnockoutRoundKey, matches: MatchRow[]) {
  const expectedMatchNumbers = roundMatchNumbers[roundKey] ?? [];
  return expectedMatchNumbers.flatMap((matchNumber) => {
    const candidates = matches.filter((match) => knockoutMatchNumber(match) === matchNumber);
    const match = candidates.sort(
      (left, right) =>
        candidateScore(right, matchNumber) - candidateScore(left, matchNumber) ||
        (right.updated_at ?? "").localeCompare(left.updated_at ?? "") ||
        (right.kickoff_time ?? "").localeCompare(left.kickoff_time ?? "")
    )[0];

    return match ? [{ matchNumber, match }] : [];
  });
}

export function resolveKnockoutChoices(
  match: KnockoutBracketMatch,
  matchesByNumber: Map<number, KnockoutBracketMatch>,
  picks: KnockoutPickState
): [KnockoutBracketTeam | null, KnockoutBracketTeam | null] {
  return match.slots.map((slot) => {
    if (slot.team) return slot.team;
    if (!slot.source) return null;

    const sourceMatch = matchesByNumber.get(slot.source.matchNumber);
    const sourcePick = picks[slot.source.matchNumber];
    if (!sourceMatch || !sourcePick) return null;

    const sourceChoices = resolveKnockoutChoices(sourceMatch, matchesByNumber, picks);
    if (!sourceChoices.some((team) => team?.id === sourcePick.id)) return null;
    if (slot.source.result === "winner") return sourcePick;

    return sourceChoices.find((team) => team && team.id !== sourcePick.id) ?? null;
  }) as [KnockoutBracketTeam | null, KnockoutBracketTeam | null];
}

export function buildKnockoutBracket({
  knockoutMatches,
  groupMatches,
  includeThirdPlace
}: {
  knockoutMatches: MatchRow[];
  groupMatches: MatchRow[];
  includeThirdPlace: boolean;
}): KnockoutBracketRound[] {
  const { standingsByGroup, teamNames } = buildGroupTables(groupMatches);
  const thirdAssignments = thirdPlaceAssignments(bestThirdGroups(standingsByGroup));
  const fallbackByRound = new Map<KnockoutRoundKey, MatchRow[]>();

  for (const match of sortedMatches(knockoutMatches)) {
    const roundKey = match.round_key as KnockoutRoundKey;
    fallbackByRound.set(roundKey, [...(fallbackByRound.get(roundKey) ?? []), match]);
  }

  const matchByNumber = new Map<number, MatchRow>();
  for (const [roundKey, matches] of fallbackByRound) {
    for (const { matchNumber, match } of assignRoundMatches(roundKey, matches)) {
      matchByNumber.set(matchNumber, match);
    }
  }

  return roundOrder
    .filter((roundKey) => includeThirdPlace || roundKey !== "third_place")
    .map((roundKey): KnockoutBracketRound => {
      const matches = roundMatchNumbers[roundKey]
        .map((matchNumber, slotIndex): KnockoutBracketMatch | null => {
          const match = matchByNumber.get(matchNumber);
          if (!match) return null;
          const seeds = roundOf32Seeds[matchNumber];
          const sources = laterRoundSources[matchNumber];

          const slots: [KnockoutBracketSlot, KnockoutBracketSlot] = seeds
            ? [
                {
                  label: seeds[0],
                  team: teamFromFixture(match, "home", seeds[0]) ?? seedTeam(matchNumber, seeds[0], standingsByGroup, teamNames, thirdAssignments)
                },
                {
                  label: seeds[1],
                  team: teamFromFixture(match, "away", seeds[1]) ?? seedTeam(matchNumber, seeds[1], standingsByGroup, teamNames, thirdAssignments)
                }
              ]
            : [
                { label: sourceLabel(sources[0]), team: null, source: sources[0] },
                { label: sourceLabel(sources[1]), team: null, source: sources[1] }
              ];

          return {
            matchNumber,
            roundKey,
            slotIndex,
            sourceMatchId: match.id,
            title: `Match ${matchNumber}`,
            slots
          };
        })
        .filter((match): match is KnockoutBracketMatch => Boolean(match));

      return { roundKey, title: roundTitles[roundKey], matches };
    })
    .filter((round) => round.matches.length);
}
