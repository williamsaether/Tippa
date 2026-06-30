import { scoringPresets, type ScoringPreset, type ScoreSettings } from "@/lib/scoring";
import { createServiceClient } from "@/lib/supabase/server";
import { recalculateScoresForTournament } from "@/lib/tournaments/sync-scores";

type SettingsRow = {
  group_id: string;
  scoring_preset: ScoringPreset;
  groups: { tournament_id: string } | { tournament_id: string }[] | null;
};

function dbSettings(settings: ScoreSettings) {
  return {
    table_exact_position_points: settings.tableExactPositionPoints,
    table_advancing_status_points: settings.tableAdvancingStatusPoints,
    table_group_winner_bonus: settings.tableGroupWinnerBonus,
    match_outcome_points: settings.matchOutcomePoints,
    exact_score_points: settings.exactScorePoints,
    correct_goal_difference_points: settings.correctGoalDifferencePoints,
    correct_outcome_points: settings.correctOutcomePoints,
    knockout_round_of_32_points: settings.knockoutRoundOf32Points,
    knockout_round_of_16_points: settings.knockoutRoundOf16Points,
    knockout_quarter_final_points: settings.knockoutQuarterFinalPoints,
    knockout_semi_final_points: settings.knockoutSemiFinalPoints,
    knockout_champion_points: settings.knockoutChampionPoints,
    knockout_third_place_points: settings.knockoutThirdPlacePoints
  };
}

function tournamentIdFor(row: SettingsRow) {
  const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
  return group?.tournament_id ?? null;
}

async function main() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("group_prediction_settings")
    .select("group_id,scoring_preset,groups!inner(tournament_id)");

  if (error) throw error;

  const rows = (data ?? []) as SettingsRow[];
  const tournamentIds = new Set<string>();
  let updated = 0;
  let skippedCustom = 0;

  for (const row of rows) {
    if (row.scoring_preset === "custom") {
      skippedCustom += 1;
      continue;
    }

    const preset = scoringPresets[row.scoring_preset as Exclude<ScoringPreset, "custom">];
    const { error: updateError } = await supabase
      .from("group_prediction_settings")
      .update(dbSettings(preset))
      .eq("group_id", row.group_id);

    if (updateError) throw updateError;
    updated += 1;

    const tournamentId = tournamentIdFor(row);
    if (tournamentId) tournamentIds.add(tournamentId);
  }

  for (const tournamentId of tournamentIds) {
    await recalculateScoresForTournament(tournamentId);
  }

  console.log({
    updated,
    skippedCustom,
    recalculatedTournaments: tournamentIds.size
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
