import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type AppUser = {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
  };
};

export function isDevAppUser(user: { email?: string | null }) {
  return env.devMode && user.email === "dev@localhost";
}

async function getDevUserId() {
  const service = createServiceClient();
  if (env.devMembership) {
    const { data, error } = await service
      .from("group_members")
      .select("user_id")
      .eq("id", env.devMembership)
      .maybeSingle();

    if (error) throw error;
    if (data?.user_id) return data.user_id as string;

    const { data: userMembership, error: userMembershipError } = await service
      .from("group_members")
      .select("user_id")
      .eq("user_id", env.devMembership)
      .limit(1)
      .maybeSingle();

    if (userMembershipError) throw userMembershipError;
    if (userMembership?.user_id) return userMembership.user_id as string;
  }

  if (env.devUserId) return env.devUserId;

  const { data, error } = await service
    .from("group_members")
    .select("user_id")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) {
    throw new Error("DEV_MODE requires DEV_MEMBERSHIP or DEV_USER_ID when no group members exist.");
  }

  return data.user_id as string;
}

export async function getOptionalAppUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) return { supabase, user };
  if (!env.devMode) return { supabase, user: null };

  const userId = await getDevUserId();
  return {
    supabase: createServiceClient(),
    user: {
      id: userId,
      email: "dev@localhost",
      user_metadata: { name: "Dev user" }
    } satisfies AppUser
  };
}

export async function requireAppUser() {
  const { supabase, user } = await getOptionalAppUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
