"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/dev-auth";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

const grantSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  expiresAtIso: z.string().datetime(),
  reason: z.string().trim().max(160).optional()
});

const revokeSchema = z.object({
  overrideId: z.string().uuid()
});

const addMemberSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]).default("member")
});

async function requireGodModeUser() {
  if (!env.devMode) throw new Error("God mode is only available in DEV_MODE.");
  return requireAppUser();
}

export async function grantGroupStagePredictionExtension(formData: FormData) {
  const parsed = grantSchema.parse({
    groupId: formData.get("groupId"),
    userId: formData.get("userId") || undefined,
    expiresAtIso: formData.get("expiresAtIso"),
    reason: formData.get("reason") || undefined
  });

  const expiresAt = new Date(parsed.expiresAtIso);
  if (expiresAt <= new Date()) throw new Error("Deadline must be in the future.");

  const { user } = await requireGodModeUser();
  const service = createServiceClient();

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
    created_by: user.id
  });

  if (error) throw error;
  revalidatePath("/god");
  revalidatePath(`/groups/${parsed.groupId}/predictions`);
}

export async function revokePredictionExtension(formData: FormData) {
  const parsed = revokeSchema.parse({
    overrideId: formData.get("overrideId")
  });

  await requireGodModeUser();
  const service = createServiceClient();
  const { data, error } = await service
    .from("prediction_lock_overrides")
    .delete()
    .eq("id", parsed.overrideId)
    .select("group_id")
    .single();

  if (error) throw error;
  revalidatePath("/god");
  if (data?.group_id) revalidatePath(`/groups/${data.group_id}/predictions`);
}

export async function addMemberToGroup(formData: FormData) {
  const parsed = addMemberSchema.parse({
    groupId: formData.get("groupId"),
    userId: formData.get("userId"),
    role: formData.get("role") || "member"
  });

  await requireGodModeUser();
  const service = createServiceClient();
  const { error } = await service.from("group_members").upsert(
    {
      group_id: parsed.groupId,
      user_id: parsed.userId,
      role: parsed.role
    },
    { onConflict: "group_id,user_id" }
  );

  if (error) throw error;
  revalidatePath("/god");
  revalidatePath(`/groups/${parsed.groupId}`);
  revalidatePath(`/groups/${parsed.groupId}/settings`);
  revalidatePath(`/groups/${parsed.groupId}/leaderboard`);
}
