import { createClient, createServiceClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getActiveGroupStageExtension(
  groupId: string,
  userId: string
) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("prediction_lock_overrides")
    .select("id,user_id,expires_at,reason")
    .eq("group_id", groupId)
    .eq("prediction_phase", "group")
    .gt("expires_at", new Date().toISOString())
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function isGroupStageOpenForUser(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
) {
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("tournament_id")
    .eq("id", groupId)
    .single();

  if (groupError) throw groupError;

  const { data: firstMatch, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("tournament_id", group.tournament_id)
    .eq("stage_type", "group")
    .order("kickoff_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (matchError) throw matchError;
  const lockedByKickoff = Boolean(firstMatch?.kickoff_time && new Date(firstMatch.kickoff_time) <= new Date());
  if (!lockedByKickoff) return { open: true, firstKickoff: firstMatch?.kickoff_time ?? null, extension: null };

  const extension = await getActiveGroupStageExtension(groupId, userId);
  return { open: Boolean(extension), firstKickoff: firstMatch?.kickoff_time ?? null, extension };
}

export async function assertGroupStageOpenForUser(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
) {
  const { open } = await isGroupStageOpenForUser(supabase, groupId, userId);
  if (!open) throw new Error("Group-stage predictions are locked.");
}
