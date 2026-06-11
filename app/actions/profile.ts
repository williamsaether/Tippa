"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/dev-auth";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  displayName: z.string().trim().min(2).max(40)
});

const groupDisplayNameSchema = schema.extend({
  groupId: z.string().uuid()
});

export async function updateProfile(formData: FormData) {
  const parsed = schema.parse({
    displayName: formData.get("displayName")
  });
  const { supabase, user } = await requireAppUser();

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: parsed.displayName
  });

  if (error) throw error;
  revalidatePath("/dashboard");
}

export async function updateGroupDisplayName(formData: FormData) {
  const parsed = groupDisplayNameSchema.parse({
    groupId: formData.get("groupId"),
    displayName: formData.get("displayName")
  });
  const { supabase, user } = await requireAppUser();

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", parsed.groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Forbidden");

  const service = createServiceClient();
  const { error } = await service
    .from("group_members")
    .update({ display_name: parsed.displayName })
    .eq("id", membership.id);

  if (error) throw error;
  revalidatePath(`/groups/${parsed.groupId}`);
  revalidatePath(`/groups/${parsed.groupId}/leaderboard`);
  revalidatePath(`/groups/${parsed.groupId}/settings`);
}
