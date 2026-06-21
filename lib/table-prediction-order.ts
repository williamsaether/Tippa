export type DefaultOrderMatch = {
  group_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string;
  away_team_name: string;
};

export type DefaultOrderTeam = {
  id: string;
  name: string;
};

// This intentionally preserves the original UI behavior: teams are ordered by
// their first appearance in the fixture list, which is sorted before this runs.
export function buildDefaultTableOrders(matches: DefaultOrderMatch[]) {
  const teamsByGroup = new Map<string, DefaultOrderTeam[]>();

  for (const match of matches) {
    if (!match.group_name) continue;
    const teams = teamsByGroup.get(match.group_name) ?? [];
    for (const team of [
      match.home_team_id ? { id: match.home_team_id, name: match.home_team_name } : null,
      match.away_team_id ? { id: match.away_team_id, name: match.away_team_name } : null
    ]) {
      if (team && !teams.some((item) => item.id === team.id)) teams.push(team);
    }
    teamsByGroup.set(match.group_name, teams);
  }

  return teamsByGroup;
}
