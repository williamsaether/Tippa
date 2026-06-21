import { createServiceClient } from "./supabase/server";
import { buildDefaultTableOrders } from "./table-prediction-order";

export async function ensureLockedTablePredictionDefaults(groupId: string) {
  const service = createServiceClient();
  const { data: group, error: groupError } = await service
    .from("groups")
    .select("tournament_id,group_prediction_settings(group_stage_prediction_mode)")
    .eq("id", groupId)
    .single();

  if (groupError) throw groupError;
  const settings = Array.isArray(group.group_prediction_settings)
    ? group.group_prediction_settings[0]
    : group.group_prediction_settings;
  if (settings?.group_stage_prediction_mode !== "table") return 0;

  const { data: firstMatch, error: firstMatchError } = await service
    .from("matches")
    .select("kickoff_time")
    .eq("tournament_id", group.tournament_id)
    .eq("stage_type", "group")
    .order("kickoff_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (firstMatchError) throw firstMatchError;
  if (!firstMatch?.kickoff_time || new Date(firstMatch.kickoff_time) > new Date()) return 0;

  const [membersResult, matchesResult, predictionsResult] = await Promise.all([
    service.from("group_members").select("user_id").eq("group_id", groupId),
    service
      .from("matches")
      .select("group_name,home_team_id,away_team_id,home_team_name,away_team_name")
      .eq("tournament_id", group.tournament_id)
      .eq("stage_type", "group")
      .order("round_order", { ascending: true })
      .order("kickoff_time", { ascending: true, nullsFirst: false }),
    service
      .from("group_table_predictions")
      .select("user_id,group_name")
      .eq("group_id", groupId)
  ]);

  if (membersResult.error) throw membersResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (predictionsResult.error) throw predictionsResult.error;

  const defaultOrders = buildDefaultTableOrders(matchesResult.data ?? []);
  const existing = new Set(
    (predictionsResult.data ?? []).map((prediction) => `${prediction.user_id}:${prediction.group_name}`)
  );
  const missing = (membersResult.data ?? []).flatMap((member) =>
    [...defaultOrders.entries()].flatMap(([groupName, teams]) =>
      existing.has(`${member.user_id}:${groupName}`) || teams.length === 0
        ? []
        : [{
            group_id: groupId,
            user_id: member.user_id,
            group_name: groupName,
            ranked_team_ids: teams.map((team) => team.id),
            third_place_advances: false
          }]
    )
  );

  if (!missing.length) return 0;
  const { error: insertError } = await service.from("group_table_predictions").upsert(missing, {
    onConflict: "group_id,user_id,group_name",
    ignoreDuplicates: true
  });
  if (insertError) throw insertError;
  return missing.length;
}

export async function ensureLockedTablePredictionDefaultsForTournament(tournamentId: string) {
  const service = createServiceClient();
  const { data: groups, error } = await service
    .from("groups")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (error) throw error;

  let inserted = 0;
  for (const group of groups ?? []) {
    inserted += await ensureLockedTablePredictionDefaults(group.id);
  }
  return inserted;
}
