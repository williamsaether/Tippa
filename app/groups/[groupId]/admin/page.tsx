import { redirect } from "next/navigation";
import {
  openKnockoutPredictions,
  recalculateGroupPredictionScores,
  saveMatchOverride,
  syncTournamentForGroup
} from "@/app/actions/admin";
import { ClientDateTime } from "@/components/client-date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAdminPageData, getGroupContext } from "@/lib/data";

export default async function AdminPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { group, isAdmin } = await getGroupContext(groupId);
  if (!isAdmin) redirect(`/groups/${groupId}`);
  const predictionSettings = Array.isArray(group.group_prediction_settings)
    ? group.group_prediction_settings[0]
    : group.group_prediction_settings;
  const { matches, firstGroup, firstKnockout } = await getAdminPageData(groupId);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Prediction phases</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">Group-stage lock</p>
            <p className="text-lg font-black">
              {firstGroup?.kickoff_time
                ? <ClientDateTime value={firstGroup.kickoff_time} />
                : "Waiting for fixtures"}
            </p>
          </div>
          <div className="rounded-3xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">Knockout predictions</p>
            <p className="text-lg font-black">
              {predictionSettings?.knockout_opened_at ? "Open" : "Not open"}
            </p>
            {firstKnockout?.kickoff_time ? (
              <p className="text-sm text-muted-foreground">
                Locks <ClientDateTime value={firstKnockout.kickoff_time} />
              </p>
            ) : null}
          </div>
          <form action={openKnockoutPredictions}>
            <input type="hidden" name="groupId" value={groupId} />
            <SubmitButton
              idleText="Open knockout predictions"
              pendingText="Opening..."
              successText="Opened"
              disabled={!firstKnockout || Boolean(predictionSettings?.knockout_opened_at)}
            />
          </form>
          <form action={recalculateGroupPredictionScores}>
            <input type="hidden" name="groupId" value={groupId} />
            <SubmitButton
              idleText="Recalculate scores"
              pendingText="Recalculating..."
              successText="Recalculated"
              variant="outline"
            />
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sync tournament data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Pull the latest fixture and score data, then recalculate prediction points.
          </p>
          <form action={syncTournamentForGroup}>
            <input type="hidden" name="groupId" value={groupId} />
            <SubmitButton idleText="Sync now" pendingText="Syncing..." successText="Synced" />
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Manual result override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(matches ?? []).map((match) => (
            <div
              key={match.id}
              className="grid gap-3 rounded-2xl bg-muted p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="font-black">
                  {match.home_team_name} vs {match.away_team_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {match.stage}
                  {match.kickoff_time ? (
                    <>
                      {" · "}
                      <ClientDateTime value={match.kickoff_time} />
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm font-black">
                <span>
                  {match.home_score ?? "-"} - {match.away_score ?? "-"}
                </span>
                <Badge variant="outline" className="capitalize">
                  {match.status}
                </Badge>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Override
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Override result</DialogTitle>
                    <DialogDescription>
                      Applies only to this group. Synced tournament data stays unchanged.
                    </DialogDescription>
                  </DialogHeader>
                  <form action={saveMatchOverride} className="space-y-4">
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <div className="rounded-2xl bg-muted p-3">
                      <p className="font-black">
                        {match.home_team_name} vs {match.away_team_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{match.stage}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`kickoff-${match.id}`}>Kickoff</Label>
                      <Input
                        id={`kickoff-${match.id}`}
                        name="kickoffTime"
                        type="datetime-local"
                        defaultValue={match.kickoff_time?.slice(0, 16) ?? ""}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`home-score-${match.id}`}>Home score</Label>
                        <Input
                          id={`home-score-${match.id}`}
                          name="homeScore"
                          type="number"
                          min="0"
                          defaultValue={match.home_score ?? ""}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`away-score-${match.id}`}>Away score</Label>
                        <Input
                          id={`away-score-${match.id}`}
                          name="awayScore"
                          type="number"
                          min="0"
                          defaultValue={match.away_score ?? ""}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select name="status" defaultValue={match.status}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                          <SelectItem value="finished">Finished</SelectItem>
                          <SelectItem value="postponed">Postponed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <SubmitButton
                      idleText="Save override"
                      pendingText="Saving..."
                      successText="Saved"
                      className="w-full"
                    />
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
