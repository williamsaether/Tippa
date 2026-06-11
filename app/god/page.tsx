import Link from "next/link";
import { notFound } from "next/navigation";
import { revokePredictionExtension } from "@/app/actions/god";
import { ClientDateTime } from "@/components/client-date-time";
import { GodAddMemberForm } from "@/components/god-add-member-form";
import { GodExtensionForm } from "@/components/god-extension-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

type MemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string | null;
  role: "admin" | "member";
  has_paid: boolean;
  joined_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

type OverrideRow = {
  id: string;
  group_id: string;
  user_id: string | null;
  expires_at: string;
  reason: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function profileName(member: MemberRow) {
  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  return member.display_name?.trim() || profile?.display_name || "Player";
}

export default async function GodPage() {
  if (!env.devMode) notFound();

  const service = createServiceClient();
  const [
    { data: groups, error: groupsError },
    { data: members, error: membersError },
    { data: overrides, error: overridesError },
    { data: profiles, error: profilesError }
  ] =
    await Promise.all([
      service
        .from("groups")
        .select("id,name,invite_code,prize_mode,created_at,tournaments(name)")
        .order("created_at", { ascending: false }),
      service
        .from("group_members")
        .select("id,group_id,user_id,display_name,role,has_paid,joined_at,profiles(display_name)")
        .order("joined_at", { ascending: true }),
      service
        .from("prediction_lock_overrides")
        .select("id,group_id,user_id,expires_at,reason")
        .eq("prediction_phase", "group")
        .order("expires_at", { ascending: false }),
      service
        .from("profiles")
        .select("id,display_name")
        .order("display_name", { ascending: true })
    ]);

  if (groupsError) throw groupsError;
  if (membersError) throw membersError;
  if (overridesError) throw overridesError;
  if (profilesError) throw profilesError;

  const membersByGroup = new Map<string, MemberRow[]>();
  for (const member of (members ?? []) as MemberRow[]) {
    membersByGroup.set(member.group_id, [...(membersByGroup.get(member.group_id) ?? []), member]);
  }

  const overridesByGroup = new Map<string, OverrideRow[]>();
  for (const override of (overrides ?? []) as OverrideRow[]) {
    overridesByGroup.set(override.group_id, [...(overridesByGroup.get(override.group_id) ?? []), override]);
  }

  return (
    <main className="page-shell space-y-5 py-6">
      <div>
        <p className="text-sm font-bold uppercase text-muted-foreground">Localhost god mode</p>
        <h1 className="text-4xl font-black">All groups</h1>
      </div>

      {(groups ?? []).map((group) => {
        const groupMembers = membersByGroup.get(group.id) ?? [];
        const groupOverrides = overridesByGroup.get(group.id) ?? [];
        const tournament = Array.isArray(group.tournaments) ? group.tournaments[0] : group.tournaments;
        const memberUserIds = new Set(groupMembers.map((member) => member.user_id));
        const addableUsers = ((profiles ?? []) as ProfileRow[])
          .filter((profile) => !memberUserIds.has(profile.id))
          .map((profile) => ({
            id: profile.id,
            displayName: profile.display_name?.trim() || profile.id
          }));

        return (
          <Card key={group.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{group.name}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tournament?.name ?? "Tournament"} · invite {group.invite_code} · {groupMembers.length} members
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/groups/${group.id}`}>Open</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl bg-muted p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black">Add member manually</p>
                  <Badge variant="outline">{addableUsers.length} available</Badge>
                </div>
                <GodAddMemberForm groupId={group.id} users={addableUsers} />
              </div>

              <div className="rounded-2xl bg-muted p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black">Allow whole group after lock</p>
                  <Badge variant="outline">Group stage</Badge>
                </div>
                <GodExtensionForm groupId={group.id} label={`${group.name} group`} />
              </div>

              {groupOverrides.length ? (
                <div className="space-y-2">
                  <p className="font-black">Prediction extensions</p>
                  {groupOverrides.map((override) => {
                    const target = override.user_id
                      ? groupMembers.find((member) => member.user_id === override.user_id)
                      : null;
                    const expired = new Date(override.expires_at) <= new Date();

                    return (
                      <div key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
                        <div>
                          <p className="font-bold">
                            {target ? profileName(target) : "Whole group"}{" "}
                            <Badge variant={expired ? "secondary" : "warm"}>{expired ? "Expired" : "Active"}</Badge>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Until <ClientDateTime value={override.expires_at} />
                            {override.reason ? ` · ${override.reason}` : ""}
                          </p>
                        </div>
                        <form action={revokePredictionExtension}>
                          <input type="hidden" name="overrideId" value={override.id} />
                          <Button type="submit" variant="destructive" size="sm">Revoke</Button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="font-black">Members</p>
                {groupMembers.map((member) => (
                  <div key={member.id} className="grid gap-3 rounded-2xl border p-3 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-bold">{profileName(member)}</p>
                        <Badge variant="outline" className="capitalize">{member.role}</Badge>
                        {member.has_paid ? <Badge variant="warm">Paid</Badge> : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{member.user_id}</p>
                    </div>
                    <GodExtensionForm groupId={group.id} userId={member.user_id} label={profileName(member)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </main>
  );
}
