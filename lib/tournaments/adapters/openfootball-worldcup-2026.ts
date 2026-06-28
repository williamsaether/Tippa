import type {
  NormalizedMatch,
  NormalizedTournamentData,
  TournamentAdapter
} from "@/lib/tournaments/types";

const SOURCE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

type OpenFootballMatch = {
  num?: number;
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  group?: string;
  score?: {
    ft?: [number, number];
  };
};

type OpenFootballTournament = {
  matches: OpenFootballMatch[];
};

function normalizeKickoff(date?: string, time?: string) {
  if (!date) return null;
  if (!time) return `${date}T00:00:00.000Z`;

  const match = time.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!match) return `${date}T00:00:00.000Z`;

  const [, hour, minute, offset] = match;
  const offsetNumber = Number(offset);
  const utcHour = Number(hour) - offsetNumber;
  const [year, month, day] = date.split("-").map(Number);
  const kickoff = new Date(Date.UTC(year, month - 1, day));
  kickoff.setUTCHours(utcHour, Number(minute), 0, 0);
  return kickoff.toISOString();
}

function statusFor(match: OpenFootballMatch): NormalizedMatch["status"] {
  if (match.score?.ft) return "finished";
  return "scheduled";
}

export function isPlaceholderTeam(name?: string) {
  if (!name) return true;
  return /^(?:\d+[A-Z](?:\/[A-Z])*|[WL]\d+)$/i.test(name.trim());
}

export function classifyRound(match: OpenFootballMatch): Pick<NormalizedMatch, "stageType" | "roundKey" | "roundOrder"> {
  const label = `${match.round ?? ""} ${match.group ?? ""}`.toLowerCase();

  if (match.group || label.includes("group")) {
    return { stageType: "group", roundKey: "group", roundOrder: 0 };
  }
  if (label.includes("third")) {
    return { stageType: "knockout", roundKey: "third_place", roundOrder: 5 };
  }
  if (label.includes("semi")) {
    return { stageType: "knockout", roundKey: "semi_final", roundOrder: 4 };
  }
  if (label.includes("quarter")) {
    return { stageType: "knockout", roundKey: "quarter_final", roundOrder: 3 };
  }
  if (label.includes("16")) {
    return { stageType: "knockout", roundKey: "round_of_16", roundOrder: 2 };
  }
  if (label.includes("32")) {
    return { stageType: "knockout", roundKey: "round_of_32", roundOrder: 1 };
  }
  if (label.trim() === "final") {
    return { stageType: "knockout", roundKey: "final", roundOrder: 6 };
  }

  return { stageType: "knockout", roundKey: "round_of_32", roundOrder: 1 };
}

export function externalIdFor(match: OpenFootballMatch, index: number) {
  if (!match.group && match.num) {
    return `world-cup-2026-match-${match.num}`;
  }

  return [
    match.date ?? "unknown-date",
    match.round ?? "unknown-round",
    match.group ?? "knockout",
    match.team1 ?? "tbd-home",
    match.team2 ?? "tbd-away",
    index + 1
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const openFootballWorldCup2026Adapter: TournamentAdapter = {
  tournamentCode: "world-cup-2026",
  async fetchTournamentData(): Promise<NormalizedTournamentData> {
    const response = await fetch(SOURCE_URL, {
      next: { revalidate: 60 * 60 }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch World Cup 2026 data: ${response.status}`);
    }

    const source = (await response.json()) as OpenFootballTournament;
    const matches = source.matches.map((match, index): NormalizedMatch => {
      const score = match.score?.ft ?? [null, null];
      const round = classifyRound(match);
      return {
        externalId: externalIdFor(match, index),
        tournamentCode: "world-cup-2026",
        stage: match.round ?? "Fixture",
        groupName: match.group,
        ...round,
        homeTeamName: isPlaceholderTeam(match.team1) ? "TBD" : match.team1 ?? "TBD",
        awayTeamName: isPlaceholderTeam(match.team2) ? "TBD" : match.team2 ?? "TBD",
        kickoffTime: normalizeKickoff(match.date, match.time),
        homeScore: score[0],
        awayScore: score[1],
        status: statusFor(match)
      };
    });

    return {
      tournamentCode: "world-cup-2026",
      groupStageAdvancement: {
        directAdvancersPerGroup: 2,
        bestThirdPlaceAdvancers: 8
      },
      matches
    };
  }
};
