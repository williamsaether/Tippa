"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/dev-auth";
import {
  calculateExactScoreResult,
  calculateOutcomePoints,
  defaultScoreSettings,
  type MatchOutcome,
  type RoundKey
} from "@/lib/scoring";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const tableSchema = z.object({
  groupId: z.string().uuid(),
  groupName: z.string().min(1),
  rankedTeamIds: z.array(z.string().uuid()).min(2),
  thirdPlaceAdvances: z.coerce.boolean().default(false)
});

const matchSchema = z.object({
  groupId: z.string().uuid(),
  matchId: z.string().uuid(),
  predictionPhase: z.enum(["group", "knockout"]).default("group"),
  predictedOutcome: z.enum(["home", "draw", "away"]).optional(),
  homeScore: z.coerce.number().int().min(0).max(99).optional(),
  awayScore: z.coerce.number().int().min(0).max(99).optional()
});

const knockoutSchema = z.object({
  groupId: z.string().uuid(),
  roundKey: z.enum(["round_of_32", "round_of_16", "quarter_final", "semi_final", "third_place", "final"]),
  slotIndex: z.coerce.number().int().min(0),
  sourceMatchId: z.string().uuid().optional(),
  predictedTeamId: z.string().uuid()
});

const copyPredictionsSchema = z.object({
  sourceGroupId: z.string().uuid(),
  targetGroupId: z.string().uuid()
});

async function requireUser() {
  return requireAppUser();
}

async function assertGroupMember(supabase: SupabaseClient, groupId: string, userId: string) {
  const { data: member, error } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!member) throw new Error("Forbidden");
}

async function getGroupTournament(supabase: SupabaseClient, groupId: string) {
  const { data: group, error } = await supabase
    .from("groups")
    .select("tournament_id,tournaments(group_best_third_place_advancers)")
    .eq("id", groupId)
    .single();

  if (error) throw error;
  const tournament = Array.isArray(group.tournaments) ? group.tournaments[0] : group.tournaments;
  return { tournamentId: group.tournament_id as string, tournament };
}

async function assertGroupStageUnlocked(supabase: SupabaseClient, groupId: string) {
  const { tournamentId } = await getGroupTournament(supabase, groupId);

  const { data: firstMatch, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("tournament_id", tournamentId)
    .eq("stage_type", "group")
    .order("kickoff_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (matchError) throw matchError;
  if (firstMatch?.kickoff_time && new Date(firstMatch.kickoff_time) <= new Date()) {
    throw new Error("Group-stage predictions are locked.");
  }
}

async function isGroupStageUnlocked(supabase: SupabaseClient, groupId: string) {
  try {
    await assertGroupStageUnlocked(supabase, groupId);
    return true;
  } catch {
    return false;
  }
}

async function getThirdPlaceAdvancerLimit(supabase: SupabaseClient, groupId: string) {
  const { tournament } = await getGroupTournament(supabase, groupId);
  return tournament?.group_best_third_place_advancers ?? 0;
}

async function assertKnockoutUnlocked(supabase: SupabaseClient, groupId: string) {
  const { data: settings, error } = await supabase
    .from("group_prediction_settings")
    .select("knockout_opened_at,knockout_locked_at")
    .eq("group_id", groupId)
    .single();

  if (error) throw error;
  if (!settings.knockout_opened_at) throw new Error("Knockout predictions are not open yet.");
  if (settings.knockout_locked_at && new Date(settings.knockout_locked_at) <= new Date()) {
    throw new Error("Knockout predictions are locked.");
  }
}

async function isKnockoutUnlocked(supabase: SupabaseClient, groupId: string) {
  try {
    await assertKnockoutUnlocked(supabase, groupId);
    return true;
  } catch {
    return false;
  }
}

async function predictionSettingsFor(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("group_prediction_settings")
    .select("group_stage_prediction_mode,knockout_prediction_mode")
    .eq("group_id", groupId)
    .single();

  if (error) throw error;
  return data;
}

async function assertTablePredictionShape(
  supabase: SupabaseClient,
  tournamentId: string,
  groupName: string,
  rankedTeamIds: string[]
) {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("home_team_id,away_team_id")
    .eq("tournament_id", tournamentId)
    .eq("stage_type", "group")
    .eq("group_name", groupName);

  if (error) throw error;
  const validTeamIds = new Set(
    (matches ?? [])
      .flatMap((match) => [match.home_team_id, match.away_team_id])
      .filter((teamId): teamId is string => Boolean(teamId))
  );

  if (!validTeamIds.size) throw new Error("Unknown group.");
  if (rankedTeamIds.length !== validTeamIds.size) throw new Error("Prediction must rank every team in the group.");
  if (new Set(rankedTeamIds).size !== rankedTeamIds.length) throw new Error("Prediction cannot include duplicate teams.");
  if (!rankedTeamIds.every((teamId) => validTeamIds.has(teamId))) {
    throw new Error("Prediction includes a team outside this group.");
  }
}

export async function saveGroupTablePrediction(formData: FormData) {
  const rankedTeamIds = formData.getAll("rankedTeamIds").map(String).filter(Boolean);
  const parsed = tableSchema.parse({
    groupId: formData.get("groupId"),
    groupName: formData.get("groupName"),
    rankedTeamIds,
    thirdPlaceAdvances: formData.get("thirdPlaceAdvances") === "true"
  });
  const { supabase, user } = await requireUser();
  await assertGroupMember(supabase, parsed.groupId, user.id);
  const { tournamentId } = await getGroupTournament(supabase, parsed.groupId);
  await assertGroupStageUnlocked(supabase, parsed.groupId);
  await assertTablePredictionShape(supabase, tournamentId, parsed.groupName, parsed.rankedTeamIds);

  const thirdPlaceAdvancerLimit = await getThirdPlaceAdvancerLimit(supabase, parsed.groupId);

  if (parsed.thirdPlaceAdvances) {
    const { count, error: countError } = await supabase
      .from("group_table_predictions")
      .select("id", { count: "exact", head: true })
      .eq("group_id", parsed.groupId)
      .eq("user_id", user.id)
      .eq("third_place_advances", true)
      .neq("group_name", parsed.groupName);

    if (countError) throw countError;
    if ((count ?? 0) >= thirdPlaceAdvancerLimit) {
      throw new Error(`Only ${thirdPlaceAdvancerLimit} third-place teams can advance.`);
    }
  }

  const { error } = await supabase.from("group_table_predictions").upsert(
    {
      group_id: parsed.groupId,
      user_id: user.id,
      group_name: parsed.groupName,
      ranked_team_ids: parsed.rankedTeamIds,
      third_place_advances: parsed.thirdPlaceAdvances
    },
    { onConflict: "group_id,user_id,group_name" }
  );

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function saveMatchPrediction(formData: FormData) {
  const parsed = matchSchema.parse({
    groupId: formData.get("groupId"),
    matchId: formData.get("matchId"),
    predictionPhase: formData.get("predictionPhase") || "group",
    predictedOutcome: formData.get("predictedOutcome") || undefined,
    homeScore: formData.get("homeScore") || undefined,
    awayScore: formData.get("awayScore") || undefined
  });
  const { supabase, user } = await requireUser();
  await assertGroupMember(supabase, parsed.groupId, user.id);
  const { tournamentId } = await getGroupTournament(supabase, parsed.groupId);
  if (parsed.predictionPhase === "knockout") {
    await assertKnockoutUnlocked(supabase, parsed.groupId);
  } else {
    await assertGroupStageUnlocked(supabase, parsed.groupId);
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("tournament_id,stage_type,status,home_score,away_score")
    .eq("id", parsed.matchId)
    .single();

  if (matchError) throw matchError;
  if (match.tournament_id !== tournamentId) throw new Error("Match does not belong to this group tournament.");
  if (match.stage_type !== parsed.predictionPhase) throw new Error("Prediction phase does not match this fixture.");

  const exactResult =
    parsed.homeScore != null && parsed.awayScore != null
      ? calculateExactScoreResult(
          { homeScore: parsed.homeScore, awayScore: parsed.awayScore },
          { status: match.status, homeScore: match.home_score, awayScore: match.away_score },
          defaultScoreSettings
        )
      : null;
  const outcomePoints = parsed.predictedOutcome
    ? calculateOutcomePoints(
        parsed.predictedOutcome as MatchOutcome,
        { status: match.status, homeScore: match.home_score, awayScore: match.away_score },
        defaultScoreSettings
      )
    : 0;

  const { error } = await supabase.from("match_predictions").upsert(
    {
      group_id: parsed.groupId,
      user_id: user.id,
      match_id: parsed.matchId,
      prediction_phase: parsed.predictionPhase,
      predicted_outcome: parsed.predictedOutcome ?? null,
      home_score: parsed.homeScore ?? null,
      away_score: parsed.awayScore ?? null,
      points: exactResult?.points ?? outcomePoints,
      exact_score: exactResult?.exactScore ?? false,
      correct_outcome: exactResult?.correctOutcome ?? outcomePoints > 0,
      correct_goal_difference: exactResult?.correctGoalDifference ?? false
    },
    { onConflict: "group_id,user_id,match_id" }
  );

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function saveKnockoutPrediction(formData: FormData) {
  const parsed = knockoutSchema.parse({
    groupId: formData.get("groupId"),
    roundKey: formData.get("roundKey"),
    slotIndex: formData.get("slotIndex"),
    sourceMatchId: formData.get("sourceMatchId") || undefined,
    predictedTeamId: formData.get("predictedTeamId")
  });
  const { supabase, user } = await requireUser();
  await assertGroupMember(supabase, parsed.groupId, user.id);
  const { tournamentId } = await getGroupTournament(supabase, parsed.groupId);
  await assertKnockoutUnlocked(supabase, parsed.groupId);

  if (!parsed.sourceMatchId) throw new Error("Knockout predictions must be tied to a fixture.");

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("tournament_id,stage_type,round_key,home_team_id,away_team_id")
    .eq("id", parsed.sourceMatchId)
    .single();

  if (matchError) throw matchError;
  if (match.tournament_id !== tournamentId) throw new Error("Match does not belong to this group tournament.");
  if (match.stage_type !== "knockout") throw new Error("Winner pick must be for a knockout fixture.");
  if (match.round_key !== parsed.roundKey) throw new Error("Winner pick round does not match the fixture.");
  if (![match.home_team_id, match.away_team_id].includes(parsed.predictedTeamId)) {
    throw new Error("Winner pick must be one of the fixture teams.");
  }

  const { error } = await supabase.from("knockout_prediction_entries").upsert(
    {
      group_id: parsed.groupId,
      user_id: user.id,
      round_key: parsed.roundKey as RoundKey,
      slot_index: parsed.slotIndex,
      source_match_id: parsed.sourceMatchId ?? null,
      predicted_team_id: parsed.predictedTeamId
    },
    { onConflict: "group_id,user_id,round_key,slot_index" }
  );

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function copyPredictionsFromGroup(formData: FormData) {
  const parsed = copyPredictionsSchema.parse({
    sourceGroupId: formData.get("sourceGroupId"),
    targetGroupId: formData.get("targetGroupId")
  });

  if (parsed.sourceGroupId === parsed.targetGroupId) {
    throw new Error("Choose a different group to copy from.");
  }

  const { supabase, user } = await requireUser();
  await Promise.all([
    assertGroupMember(supabase, parsed.sourceGroupId, user.id),
    assertGroupMember(supabase, parsed.targetGroupId, user.id)
  ]);

  const [source, target, sourceSettings, targetSettings] = await Promise.all([
    getGroupTournament(supabase, parsed.sourceGroupId),
    getGroupTournament(supabase, parsed.targetGroupId),
    predictionSettingsFor(supabase, parsed.sourceGroupId),
    predictionSettingsFor(supabase, parsed.targetGroupId)
  ]);

  if (source.tournamentId !== target.tournamentId) {
    throw new Error("Predictions can only be copied between groups in the same tournament.");
  }

  let copied = 0;
  const groupStageOpen = await isGroupStageUnlocked(supabase, parsed.targetGroupId);

  if (
    groupStageOpen &&
    sourceSettings.group_stage_prediction_mode === targetSettings.group_stage_prediction_mode
  ) {
    if (targetSettings.group_stage_prediction_mode === "table") {
      const { data, error } = await supabase
        .from("group_table_predictions")
        .select("group_name,ranked_team_ids,third_place_advances")
        .eq("group_id", parsed.sourceGroupId)
        .eq("user_id", user.id);

      if (error) throw error;
      if (data?.length) {
        const { error: upsertError } = await supabase.from("group_table_predictions").upsert(
          data.map((prediction) => ({
            group_id: parsed.targetGroupId,
            user_id: user.id,
            group_name: prediction.group_name,
            ranked_team_ids: prediction.ranked_team_ids,
            third_place_advances: prediction.third_place_advances
          })),
          { onConflict: "group_id,user_id,group_name" }
        );
        if (upsertError) throw upsertError;
        copied += data.length;
      }
    } else {
      const { data, error } = await supabase
        .from("match_predictions")
        .select("match_id,predicted_outcome,home_score,away_score,exact_score,correct_outcome,correct_goal_difference")
        .eq("group_id", parsed.sourceGroupId)
        .eq("user_id", user.id)
        .eq("prediction_phase", "group");

      if (error) throw error;
      if (data?.length) {
        const { error: upsertError } = await supabase.from("match_predictions").upsert(
          data.map((prediction) => ({
            group_id: parsed.targetGroupId,
            user_id: user.id,
            match_id: prediction.match_id,
            prediction_phase: "group",
            predicted_outcome: prediction.predicted_outcome,
            home_score: prediction.home_score,
            away_score: prediction.away_score,
            points: 0,
            exact_score: false,
            correct_outcome: false,
            correct_goal_difference: false
          })),
          { onConflict: "group_id,user_id,match_id" }
        );
        if (upsertError) throw upsertError;
        copied += data.length;
      }
    }
  }

  const knockoutOpen = await isKnockoutUnlocked(supabase, parsed.targetGroupId);
  if (knockoutOpen && sourceSettings.knockout_prediction_mode === targetSettings.knockout_prediction_mode) {
    if (targetSettings.knockout_prediction_mode === "winner_bracket") {
      const { data, error } = await supabase
        .from("knockout_prediction_entries")
        .select("round_key,slot_index,source_match_id,predicted_team_id")
        .eq("group_id", parsed.sourceGroupId)
        .eq("user_id", user.id);

      if (error) throw error;
      if (data?.length) {
        const { error: upsertError } = await supabase.from("knockout_prediction_entries").upsert(
          data.map((prediction) => ({
            group_id: parsed.targetGroupId,
            user_id: user.id,
            round_key: prediction.round_key,
            slot_index: prediction.slot_index,
            source_match_id: prediction.source_match_id,
            predicted_team_id: prediction.predicted_team_id,
            points: 0
          })),
          { onConflict: "group_id,user_id,round_key,slot_index" }
        );
        if (upsertError) throw upsertError;
        copied += data.length;
      }
    } else {
      const { data, error } = await supabase
        .from("match_predictions")
        .select("match_id,predicted_outcome,home_score,away_score")
        .eq("group_id", parsed.sourceGroupId)
        .eq("user_id", user.id)
        .eq("prediction_phase", "knockout");

      if (error) throw error;
      if (data?.length) {
        const { error: upsertError } = await supabase.from("match_predictions").upsert(
          data.map((prediction) => ({
            group_id: parsed.targetGroupId,
            user_id: user.id,
            match_id: prediction.match_id,
            prediction_phase: "knockout",
            predicted_outcome: prediction.predicted_outcome,
            home_score: prediction.home_score,
            away_score: prediction.away_score,
            points: 0,
            exact_score: false,
            correct_outcome: false,
            correct_goal_difference: false
          })),
          { onConflict: "group_id,user_id,match_id" }
        );
        if (upsertError) throw upsertError;
        copied += data.length;
      }
    }
  }

  if (!copied) {
    throw new Error("No compatible open predictions were available to copy.");
  }

  revalidatePath(`/groups/${parsed.targetGroupId}/predictions`);
}
