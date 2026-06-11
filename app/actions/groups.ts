"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/dev-auth";
import { scoringPresets, type ScoringPreset } from "@/lib/scoring";
import { createInviteCode } from "@/lib/utils";

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tournamentCode: z.string().min(1),
  inviteCode: z.string().trim().min(3).max(24),
  groupStagePredictionMode: z.enum(["table", "match_outcome", "exact_score"]).default("table"),
  knockoutPredictionMode: z.enum(["winner_bracket", "exact_score"]).default("winner_bracket"),
  includeThirdPlace: z.coerce.boolean().optional(),
  scoringPreset: z.enum(["simple", "balanced", "high_stakes", "custom"]).default("balanced"),
  prizeMode: z.enum(["none", "sponsored", "buy_in", "hybrid"]),
  currency: z.string().trim().min(3).max(3).default("NOK"),
  sponsorName: z.string().trim().max(60).optional(),
  basePrizeAmount: z.coerce.number().min(0).optional(),
  buyInAmount: z.coerce.number().min(0).optional(),
  buyInRequired: z.coerce.boolean().optional(),
  payoutDescription: z.string().trim().max(240).optional(),
  tableExactPositionPoints: z.coerce.number().int().min(0).optional(),
  tableAdvancingStatusPoints: z.coerce.number().int().min(0).optional(),
  tableGroupWinnerBonus: z.coerce.number().int().min(0).optional(),
  matchOutcomePoints: z.coerce.number().int().min(0).optional(),
  exactScorePoints: z.coerce.number().int().min(0).optional(),
  correctGoalDifferencePoints: z.coerce.number().int().min(0).optional(),
  correctOutcomePoints: z.coerce.number().int().min(0).optional(),
  knockoutRoundOf32Points: z.coerce.number().int().min(0).optional(),
  knockoutRoundOf16Points: z.coerce.number().int().min(0).optional(),
  knockoutQuarterFinalPoints: z.coerce.number().int().min(0).optional(),
  knockoutSemiFinalPoints: z.coerce.number().int().min(0).optional(),
  knockoutChampionPoints: z.coerce.number().int().min(0).optional(),
  knockoutThirdPlacePoints: z.coerce.number().int().min(0).optional()
});

const predictionExtensionSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  expiresAtIso: z.string().datetime(),
  reason: z.string().trim().max(160).optional()
});

const revokePredictionExtensionSchema = z.object({
  groupId: z.string().uuid(),
  overrideId: z.string().uuid()
});

type ScoreSettingInput = Partial<z.infer<typeof createGroupSchema>> & {
  scoringPreset: ScoringPreset;
};

function scoreSettingsFor(parsed: ScoreSettingInput) {
  const preset = parsed.scoringPreset === "custom" ? scoringPresets.balanced : scoringPresets[parsed.scoringPreset as Exclude<ScoringPreset, "custom">];
  return {
    table_exact_position_points: parsed.tableExactPositionPoints ?? preset.tableExactPositionPoints,
    table_advancing_status_points:
      parsed.tableAdvancingStatusPoints ?? preset.tableAdvancingStatusPoints,
    table_group_winner_bonus: parsed.tableGroupWinnerBonus ?? preset.tableGroupWinnerBonus,
    match_outcome_points: parsed.matchOutcomePoints ?? preset.matchOutcomePoints,
    exact_score_points: parsed.exactScorePoints ?? preset.exactScorePoints,
    correct_goal_difference_points:
      parsed.correctGoalDifferencePoints ?? preset.correctGoalDifferencePoints,
    correct_outcome_points: parsed.correctOutcomePoints ?? preset.correctOutcomePoints,
    knockout_round_of_32_points:
      parsed.knockoutRoundOf32Points ?? preset.knockoutRoundOf32Points,
    knockout_round_of_16_points:
      parsed.knockoutRoundOf16Points ?? preset.knockoutRoundOf16Points,
    knockout_quarter_final_points:
      parsed.knockoutQuarterFinalPoints ?? preset.knockoutQuarterFinalPoints,
    knockout_semi_final_points: parsed.knockoutSemiFinalPoints ?? preset.knockoutSemiFinalPoints,
    knockout_champion_points: parsed.knockoutChampionPoints ?? preset.knockoutChampionPoints,
    knockout_third_place_points:
      parsed.knockoutThirdPlacePoints ?? preset.knockoutThirdPlacePoints
  };
}

export async function createGroup(formData: FormData) {
  const parsed = createGroupSchema.parse({
    name: formData.get("name"),
    tournamentCode: formData.get("tournamentCode"),
    inviteCode: formData.get("inviteCode"),
    groupStagePredictionMode: formData.get("groupStagePredictionMode") || "table",
    knockoutPredictionMode: formData.get("knockoutPredictionMode") || "winner_bracket",
    includeThirdPlace: formData.get("includeThirdPlace") === "on",
    scoringPreset: formData.get("scoringPreset") || "balanced",
    prizeMode: formData.get("prizeMode"),
    currency: formData.get("currency") || "NOK",
    sponsorName: formData.get("sponsorName") || undefined,
    basePrizeAmount: formData.get("basePrizeAmount") || undefined,
    buyInAmount: formData.get("buyInAmount") || undefined,
    buyInRequired: formData.get("buyInRequired") === "on",
    payoutDescription: formData.get("payoutDescription") || undefined,
    tableExactPositionPoints: formData.get("tableExactPositionPoints") || undefined,
    tableAdvancingStatusPoints: formData.get("tableAdvancingStatusPoints") || undefined,
    tableGroupWinnerBonus: formData.get("tableGroupWinnerBonus") || undefined,
    matchOutcomePoints: formData.get("matchOutcomePoints") || undefined,
    exactScorePoints: formData.get("exactScorePoints") || undefined,
    correctGoalDifferencePoints: formData.get("correctGoalDifferencePoints") || undefined,
    correctOutcomePoints: formData.get("correctOutcomePoints") || undefined,
    knockoutRoundOf32Points: formData.get("knockoutRoundOf32Points") || undefined,
    knockoutRoundOf16Points: formData.get("knockoutRoundOf16Points") || undefined,
    knockoutQuarterFinalPoints: formData.get("knockoutQuarterFinalPoints") || undefined,
    knockoutSemiFinalPoints: formData.get("knockoutSemiFinalPoints") || undefined,
    knockoutChampionPoints: formData.get("knockoutChampionPoints") || undefined,
    knockoutThirdPlacePoints: formData.get("knockoutThirdPlacePoints") || undefined
  });

  const { user } = await requireAppUser();

  await ensureProfile(user.id, user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Player");

  const service = createServiceClient();
  const { data: tournament, error: tournamentError } = await service
    .from("tournaments")
    .select("id")
    .eq("code", parsed.tournamentCode)
    .eq("is_supported", true)
    .single();

  if (tournamentError) throw tournamentError;

  const { data: group, error: groupError } = await service
    .from("groups")
    .insert({
      tournament_id: tournament.id,
      name: parsed.name,
      invite_code: createInviteCode(parsed.inviteCode),
      created_by: user.id,
      prize_mode: parsed.prizeMode,
      currency: parsed.currency.toUpperCase(),
      sponsor_name: parsed.sponsorName || null,
      base_prize_amount: parsed.basePrizeAmount ?? null,
      buy_in_amount: parsed.buyInAmount ?? null,
      buy_in_required: parsed.buyInRequired ?? false,
      payout_description: parsed.payoutDescription || null
    })
    .select("id")
    .single();

  if (groupError) throw groupError;

  const { error: memberError } = await service.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin"
  });
  if (memberError) throw memberError;

  const { error: settingsError } = await service.from("group_prediction_settings").insert({
    group_id: group.id,
    group_stage_prediction_mode: parsed.groupStagePredictionMode,
    knockout_prediction_mode: parsed.knockoutPredictionMode,
    include_third_place: parsed.includeThirdPlace ?? false,
    scoring_preset: parsed.scoringPreset,
    ...scoreSettingsFor(parsed)
  });
  if (settingsError) throw settingsError;

  revalidatePath("/dashboard");
  redirect(`/groups/${group.id}`);
}

export type JoinGroupState = {
  error?: string;
};

export async function joinGroup(_state: JoinGroupState, formData: FormData): Promise<JoinGroupState> {
  const inviteCode = createInviteCode(String(formData.get("inviteCode")));
  return joinGroupByInviteCode(inviteCode);
}

export async function joinGroupFromInvite(formData: FormData) {
  const inviteCode = createInviteCode(String(formData.get("inviteCode")));
  const result = await joinGroupByInviteCode(inviteCode);
  if (result.error) redirect(`/invite?code=${encodeURIComponent(inviteCode)}&error=join`);
}

async function joinGroupByInviteCode(inviteCode: string): Promise<JoinGroupState> {
  if (inviteCode.length < 3) {
    return { error: "Enter a valid invite code." };
  }

  const { user } = await requireAppUser();

  await ensureProfile(user.id, user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Player");

  const service = createServiceClient();
  const { data: group, error: groupError } = await service
    .from("groups")
    .select("id")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (groupError) {
    return { error: "Could not check that invite code. Try again." };
  }
  if (!group) {
    return { error: "No group found with that invite code." };
  }

  const { error } = await service.from("group_members").upsert(
    {
      group_id: group.id,
      user_id: user.id,
      role: "member"
    },
    { onConflict: "group_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    return { error: "Could not join that group. Try again." };
  }
  revalidatePath("/dashboard");
  redirect(`/groups/${group.id}`);
}

export async function updateGroupSettings(formData: FormData) {
  const groupId = String(formData.get("groupId"));
  const parsed = createGroupSchema
    .omit({ tournamentCode: true, inviteCode: true })
    .parse({
      name: formData.get("name"),
      groupStagePredictionMode: formData.get("groupStagePredictionMode") || "table",
      knockoutPredictionMode: formData.get("knockoutPredictionMode") || "winner_bracket",
      includeThirdPlace: formData.get("includeThirdPlace") === "on",
      scoringPreset: formData.get("scoringPreset") || "balanced",
      prizeMode: formData.get("prizeMode"),
      currency: formData.get("currency") || "NOK",
      sponsorName: formData.get("sponsorName") || undefined,
      basePrizeAmount: formData.get("basePrizeAmount") || undefined,
      buyInAmount: formData.get("buyInAmount") || undefined,
      buyInRequired: formData.get("buyInRequired") === "on",
      payoutDescription: formData.get("payoutDescription") || undefined,
      tableExactPositionPoints: formData.get("tableExactPositionPoints") || undefined,
      tableAdvancingStatusPoints: formData.get("tableAdvancingStatusPoints") || undefined,
      tableGroupWinnerBonus: formData.get("tableGroupWinnerBonus") || undefined,
      matchOutcomePoints: formData.get("matchOutcomePoints") || undefined,
      exactScorePoints: formData.get("exactScorePoints") || undefined,
      correctGoalDifferencePoints: formData.get("correctGoalDifferencePoints") || undefined,
      correctOutcomePoints: formData.get("correctOutcomePoints") || undefined,
      knockoutRoundOf32Points: formData.get("knockoutRoundOf32Points") || undefined,
      knockoutRoundOf16Points: formData.get("knockoutRoundOf16Points") || undefined,
      knockoutQuarterFinalPoints: formData.get("knockoutQuarterFinalPoints") || undefined,
      knockoutSemiFinalPoints: formData.get("knockoutSemiFinalPoints") || undefined,
      knockoutChampionPoints: formData.get("knockoutChampionPoints") || undefined,
      knockoutThirdPlacePoints: formData.get("knockoutThirdPlacePoints") || undefined
    });

  const { supabase, user } = await requireAppUser();

  const { data: member, error: memberError } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) throw memberError;
  if (member?.role !== "admin") throw new Error("Forbidden");

  const service = createServiceClient();
  const { error } = await service
    .from("groups")
    .update({
      name: parsed.name,
      prize_mode: parsed.prizeMode,
      currency: parsed.currency.toUpperCase(),
      sponsor_name: parsed.sponsorName || null,
      base_prize_amount: parsed.basePrizeAmount ?? null,
      buy_in_amount: parsed.buyInAmount ?? null,
      buy_in_required: parsed.buyInRequired ?? false,
      payout_description: parsed.payoutDescription || null
    })
    .eq("id", groupId);

  if (error) throw error;

  const { error: settingsError } = await service
    .from("group_prediction_settings")
    .update({
      group_stage_prediction_mode: parsed.groupStagePredictionMode,
      knockout_prediction_mode: parsed.knockoutPredictionMode,
      include_third_place: parsed.includeThirdPlace ?? false,
      scoring_preset: parsed.scoringPreset,
      ...scoreSettingsFor(parsed)
    })
    .eq("group_id", groupId);

  if (settingsError) throw settingsError;
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath("/dashboard");
}

export async function leaveGroup(formData: FormData) {
  const groupId = String(formData.get("groupId"));
  const { supabase, user } = await requireAppUser();

  await assertNotLastAdmin(groupId, user.id);

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateMemberRole(formData: FormData) {
  const groupId = String(formData.get("groupId"));
  const memberId = String(formData.get("memberId"));
  const role = String(formData.get("role"));
  if (role !== "admin" && role !== "member") throw new Error("Invalid role");

  const actingUser = await requireGroupAdmin(groupId);
  const service = createServiceClient();

  const { data: target, error: targetError } = await service
    .from("group_members")
    .select("id,user_id,role")
    .eq("id", memberId)
    .eq("group_id", groupId)
    .single();

  if (targetError) throw targetError;
  if (target.user_id === actingUser.id && role !== "admin") {
    await assertNotLastAdmin(groupId, target.user_id);
  }

  const { error } = await service
    .from("group_members")
    .update({ role })
    .eq("id", memberId)
    .eq("group_id", groupId);

  if (error) throw error;
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
}

export async function grantGroupStagePredictionExtension(formData: FormData) {
  const parsed = predictionExtensionSchema.parse({
    groupId: formData.get("groupId"),
    userId: formData.get("userId") || undefined,
    expiresAtIso: formData.get("expiresAtIso"),
    reason: formData.get("reason") || undefined
  });

  const expiresAt = new Date(parsed.expiresAtIso);
  if (expiresAt <= new Date()) throw new Error("Deadline must be in the future.");

  const actingUser = await requireGroupAdmin(parsed.groupId);
  const service = createServiceClient();

  if (parsed.userId) {
    const { data: member, error: memberError } = await service
      .from("group_members")
      .select("id")
      .eq("group_id", parsed.groupId)
      .eq("user_id", parsed.userId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) throw new Error("User is not a member of this group.");
  }

  let existingQuery = service
    .from("prediction_lock_overrides")
    .delete()
    .eq("group_id", parsed.groupId)
    .eq("prediction_phase", "group");

  existingQuery = parsed.userId ? existingQuery.eq("user_id", parsed.userId) : existingQuery.is("user_id", null);
  const { error: deleteError } = await existingQuery;
  if (deleteError) throw deleteError;

  const { error } = await service.from("prediction_lock_overrides").insert({
    group_id: parsed.groupId,
    user_id: parsed.userId ?? null,
    prediction_phase: "group",
    expires_at: expiresAt.toISOString(),
    reason: parsed.reason || null,
    created_by: actingUser.id
  });

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}/settings`);
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function revokeGroupStagePredictionExtension(formData: FormData) {
  const parsed = revokePredictionExtensionSchema.parse({
    groupId: formData.get("groupId"),
    overrideId: formData.get("overrideId")
  });

  await requireGroupAdmin(parsed.groupId);
  const service = createServiceClient();
  const { error } = await service
    .from("prediction_lock_overrides")
    .delete()
    .eq("id", parsed.overrideId)
    .eq("group_id", parsed.groupId);

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}/settings`);
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function removeGroupMember(formData: FormData) {
  const groupId = String(formData.get("groupId"));
  const memberId = String(formData.get("memberId"));
  await requireGroupAdmin(groupId);

  const service = createServiceClient();
  const { data: target, error: targetError } = await service
    .from("group_members")
    .select("id,user_id,role")
    .eq("id", memberId)
    .eq("group_id", groupId)
    .single();

  if (targetError) throw targetError;
  await assertNotLastAdmin(groupId, target.user_id);

  const { error } = await service
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .eq("group_id", groupId);

  if (error) throw error;
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath("/dashboard");
}

export async function markPaid(formData: FormData) {
  const groupId = String(formData.get("groupId"));
  const memberId = String(formData.get("memberId"));
  const hasPaid = formData.get("hasPaid") === "true";
  const { supabase } = await requireAppUser();

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("prize_mode")
    .eq("id", groupId)
    .single();

  if (groupError) throw groupError;
  if (group.prize_mode !== "buy_in" && group.prize_mode !== "hybrid") {
    throw new Error("This group does not track member payments.");
  }

  const { error } = await supabase
    .from("group_members")
    .update({ has_paid: hasPaid })
    .eq("id", memberId);

  if (error) throw error;
  revalidatePath(`/groups/${groupId}`);
}

async function requireGroupAdmin(groupId: string) {
  const { supabase, user } = await requireAppUser();

  const { data: member, error } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (member?.role !== "admin") throw new Error("Forbidden");
  return user;
}

async function assertNotLastAdmin(groupId: string, userId: string) {
  const service = createServiceClient();
  const { data: membership, error: membershipError } = await service
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (membership?.role !== "admin") return;

  const { count, error } = await service
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("role", "admin");

  if (error) throw error;
  if ((count ?? 0) <= 1) throw new Error("A group must have at least one admin.");
}

async function ensureProfile(userId: string, displayName: string) {
  const service = createServiceClient();
  await service.from("profiles").upsert({
    id: userId,
    display_name: displayName
  });
}
