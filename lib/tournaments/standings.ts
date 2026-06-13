export type StandingsMatch = {
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
};

export type StandingRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst: number;
};

export function calculateGroupStandings(
  matches: StandingsMatch[],
  options: { includeTeamsWithoutResults?: boolean } = {}
): StandingRow[] {
  const table = new Map<string, StandingRow>();

  function rowFor(teamId: string) {
    return (
      table.get(teamId) ?? {
        teamId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
        goalDifference: 0,
        goalsFor: 0,
        goalsAgainst: 0
      }
    );
  }

  if (options.includeTeamsWithoutResults) {
    for (const match of matches) {
      if (match.home_team_id) table.set(match.home_team_id, rowFor(match.home_team_id));
      if (match.away_team_id) table.set(match.away_team_id, rowFor(match.away_team_id));
    }
  }

  for (const match of matches) {
    if (
      match.status !== "finished" ||
      !match.home_team_id ||
      !match.away_team_id ||
      match.home_score == null ||
      match.away_score == null
    ) {
      continue;
    }

    const home = rowFor(match.home_team_id);
    const away = rowFor(match.away_team_id);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.home_score;
    home.goalsAgainst += match.away_score;
    away.goalsFor += match.away_score;
    away.goalsAgainst += match.home_score;
    home.goalDifference += match.home_score - match.away_score;
    away.goalDifference += match.away_score - match.home_score;

    if (match.home_score > match.away_score) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (match.home_score < match.away_score) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }

    table.set(home.teamId, home);
    table.set(away.teamId, away);
  }

  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId)
  );
}
