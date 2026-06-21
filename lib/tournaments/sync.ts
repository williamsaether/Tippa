import { createServiceClient } from "@/lib/supabase/server";
import { flagForTeam } from "@/lib/team-flags";
import { getAdapterByCode, supportedTournaments } from "@/lib/tournaments/registry";
import type { NormalizedMatch } from "@/lib/tournaments/types";
import { recalculateScoresForTournament } from "@/lib/tournaments/sync-scores";
import { ensureLockedTablePredictionDefaultsForTournament } from "@/lib/table-prediction-defaults";

export async function syncTournament(tournamentCode: string) {
  const adapter = getAdapterByCode(tournamentCode);
  if (!adapter) throw new Error(`No adapter registered for ${tournamentCode}`);

  const supabase = createServiceClient();
  const tournament = supportedTournaments.find((item) => item.code === tournamentCode);
  if (!tournament) throw new Error(`Unsupported tournament ${tournamentCode}`);
  const data = await adapter.fetchTournamentData();

  const { data: tournamentRow, error: tournamentError } = await supabase
    .from("tournaments")
    .upsert(
      {
        code: tournament.code,
        name: tournament.name,
        year: tournament.year,
        source: tournament.source,
        is_supported: tournament.isSupported,
        group_direct_advancers: data.groupStageAdvancement.directAdvancersPerGroup,
        group_best_third_place_advancers: data.groupStageAdvancement.bestThirdPlaceAdvancers,
        theme: tournament.theme
      },
      { onConflict: "code" }
    )
    .select("id")
    .single();

  if (tournamentError) throw tournamentError;

  const teamNames = Array.from(
    new Set(
      data.matches
        .flatMap((match) => [match.homeTeamName, match.awayTeamName])
        .filter((name): name is string => Boolean(name) && name !== "TBD")
    )
  );

  const { error: teamsError } = await supabase.from("teams").upsert(
    teamNames.map((name) => ({
      tournament_id: tournamentRow.id,
      name,
      short_name: name,
      flag_emoji: flagForTeam(name)
    })),
    { onConflict: "tournament_id,name" }
  );

  if (teamsError) throw teamsError;

  const { data: teams, error: fetchTeamsError } = await supabase
    .from("teams")
    .select("id,name")
    .eq("tournament_id", tournamentRow.id);

  if (fetchTeamsError) throw fetchTeamsError;
  const teamIdByName = new Map(teams?.map((team) => [team.name, team.id]));

  const rows = data.matches.map((match: NormalizedMatch) => ({
    tournament_id: tournamentRow.id,
    external_id: match.externalId,
    stage: match.stage,
    group_name: match.groupName ?? null,
    stage_type: match.stageType,
    round_key: match.roundKey,
    round_order: match.roundOrder,
    home_team_id: teamIdByName.get(match.homeTeamName) ?? null,
    away_team_id: teamIdByName.get(match.awayTeamName) ?? null,
    home_team_name: match.homeTeamName,
    away_team_name: match.awayTeamName,
    kickoff_time: match.kickoffTime,
    status: match.status,
    home_score: match.homeScore,
    away_score: match.awayScore
  }));

  const { error: matchesError } = await supabase.from("matches").upsert(rows, {
    onConflict: "tournament_id,external_id",
    ignoreDuplicates: false
  });

  if (matchesError) throw matchesError;
  await ensureLockedTablePredictionDefaultsForTournament(tournamentRow.id);
  await recalculateScoresForTournament(tournamentRow.id);

  return {
    tournamentCode,
    matches: rows.length,
    teams: teamNames.length
  };
}

export async function syncSupportedTournaments() {
  const results = [];
  for (const tournament of supportedTournaments.filter((item) => item.isSupported)) {
    results.push(await syncTournament(tournament.code));
  }
  return results;
}
