import {
  leaveGroup,
  removeGroupMember,
  revokeGroupStagePredictionExtension,
  updateGroupSettings,
  updateMemberRole
} from "@/app/actions/groups";
import { updateGroupDisplayName } from "@/app/actions/profile";
import { ClientDateTime } from "@/components/client-date-time";
import { PredictionExtensionForm } from "@/components/prediction-extension-form";
import { PrizeSettingsFields } from "@/components/prize-settings-fields";
import { ScoringSettingsFields } from "@/components/scoring-settings-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { getGroupContext, getGroupPredictionExtensions } from "@/lib/data";

type MemberLike = {
  display_name?: string | null;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

function memberDisplayName(member: MemberLike) {
  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  return member.display_name?.trim() || profile?.display_name || "Player";
}

export default async function SettingsPage({
  params
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { group, members, user, isAdmin } = await getGroupContext(groupId);
  const predictionSettings = Array.isArray(group.group_prediction_settings)
    ? group.group_prediction_settings[0]
    : group.group_prediction_settings;
  const membership = members.find((member) => member.user_id === user.id);
  const profile = Array.isArray(membership?.profiles) ? membership.profiles[0] : membership?.profiles;
  const predictionExtensions = isAdmin ? await getGroupPredictionExtensions(groupId) : [];
  const groupExtension = predictionExtensions.find((extension) => !extension.user_id);
  const extensionsByUser = new Map(
    predictionExtensions
      .filter((extension) => extension.user_id)
      .map((extension) => [extension.user_id, extension])
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your name in this group</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateGroupDisplayName} className="flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="groupId" value={groupId} />
            <div className="flex-1 space-y-2">
              <Label htmlFor="groupDisplayName">Display name</Label>
              <Input
                id="groupDisplayName"
                name="displayName"
                defaultValue={membership?.display_name ?? profile?.display_name ?? ""}
                required
              />
            </div>
            <SubmitButton
              idleText="Save name"
              pendingText="Saving..."
              successText="Saved"
              variant="outline"
              className="self-end"
            />
          </form>
        </CardContent>
      </Card>
      {isAdmin ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Prediction extensions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-muted p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black">Whole group</p>
                    {groupExtension ? (
                      <p className="text-sm text-muted-foreground">
                        Extended until <ClientDateTime value={groupExtension.expires_at} />
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No group-wide extension.</p>
                    )}
                  </div>
                  {groupExtension ? (
                    <form action={revokeGroupStagePredictionExtension}>
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="overrideId" value={groupExtension.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        Revoke
                      </Button>
                    </form>
                  ) : null}
                </div>
                <PredictionExtensionForm groupId={groupId} />
              </div>

              <div className="space-y-2">
                {members.map((member) => {
                  const displayName = memberDisplayName(member);
                  const extension = extensionsByUser.get(member.user_id);

                  return (
                    <div key={member.id} className="grid gap-3 rounded-2xl border p-3 lg:grid-cols-[1fr_1.4fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-bold">{displayName}</p>
                          {extension ? <Badge variant="warm">Extended</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {extension ? (
                            <>
                              Until <ClientDateTime value={extension.expires_at} />
                            </>
                          ) : (
                            "Uses normal group-stage lock."
                          )}
                        </p>
                      </div>
                      <PredictionExtensionForm groupId={groupId} userId={member.user_id} compact />
                      {extension ? (
                        <form action={revokeGroupStagePredictionExtension}>
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="overrideId" value={extension.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Revoke
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((member) => {
                const displayName = memberDisplayName(member);
                const isCurrentUser = member.user_id === user.id;

                return (
                  <div
                    key={member.id}
                    className="grid gap-3 rounded-2xl bg-muted p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-black">{displayName}</p>
                        {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
                      </div>
                      <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                    </div>
                    <form action={updateMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <Select name="role" defaultValue={member.role}>
                        <SelectTrigger className="w-32 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <SubmitButton idleText="Update" variant="outline" size="sm" />
                    </form>
                    {isCurrentUser ? (
                      <Badge variant="outline" className="justify-self-start md:justify-self-end">
                        Current user
                      </Badge>
                    ) : (
                      <form action={removeGroupMember}>
                        <input type="hidden" name="groupId" value={groupId} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <SubmitButton
                          idleText="Remove"
                          pendingText="Removing..."
                          successText="Removed"
                          variant="destructive"
                          size="sm"
                        />
                      </form>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Group settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateGroupSettings} className="space-y-5">
                <input type="hidden" name="groupId" value={groupId} />
                <div className="space-y-2">
                  <Label htmlFor="name">Group name</Label>
                  <Input id="name" name="name" defaultValue={group.name} required />
                </div>
                <div className="grid gap-4 rounded-3xl bg-muted p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Group-stage predictions</Label>
                    <Select
                      name="groupStagePredictionMode"
                      defaultValue={predictionSettings?.group_stage_prediction_mode ?? "table"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Rank each group table</SelectItem>
                        <SelectItem value="match_outcome">Pick match winners</SelectItem>
                        <SelectItem value="exact_score">Predict exact scores</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Scoring preset</Label>
                    <Select
                      name="scoringPreset"
                      defaultValue={predictionSettings?.scoring_preset ?? "balanced"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="high_stakes">High stakes</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Knockout predictions</Label>
                    <Select
                      name="knockoutPredictionMode"
                      defaultValue={predictionSettings?.knockout_prediction_mode ?? "winner_bracket"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="winner_bracket">Pick bracket winners</SelectItem>
                        <SelectItem value="exact_score">Predict knockout scores</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
                    <input
                      name="includeThirdPlace"
                      type="checkbox"
                      className="h-4 w-4"
                      defaultChecked={predictionSettings?.include_third_place ?? false}
                    />
                    Include third-place match in knockout predictions
                  </label>
                  <ScoringSettingsFields defaults={predictionSettings} />
                </div>
                <PrizeSettingsFields defaults={group} />
                <SubmitButton idleText="Save settings" />
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <MemberSettings groupId={groupId} />
      )}
    </>
  );
}

function MemberSettings({ groupId }: { groupId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave group</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={leaveGroup}>
          <input type="hidden" name="groupId" value={groupId} />
          <Button type="submit" variant="destructive">
            Leave group
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
