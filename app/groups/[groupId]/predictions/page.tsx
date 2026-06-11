import { Trophy } from "lucide-react";
import { saveKnockoutPrediction, saveMatchPrediction } from "@/app/actions/predictions";
import { ClientDateTime } from "@/components/client-date-time";
import { GroupTablePredictions } from "@/components/group-table-predictions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGroupContext, getPredictionPageData } from "@/lib/data";
import { flagForTeam } from "@/lib/team-flags";

type MatchRow = {
  id: string;
  stage: string;
  group_name: string | null;
  stage_type: "group" | "knockout";
  round_key: string;
  round_order: number;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string;
  away_team_name: string;
  kickoff_time: string | null;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  home_score: number | null;
  away_score: number | null;
};

type TeamOption = {
  id: string;
  name: string;
  flag: string;
};

function settingsFor(group: { group_prediction_settings?: unknown }) {
  const raw = group.group_prediction_settings;
  return (Array.isArray(raw) ? raw[0] : raw) as
    | {
        group_stage_prediction_mode: "table" | "match_outcome" | "exact_score";
        knockout_prediction_mode: "winner_bracket" | "exact_score";
        include_third_place: boolean;
        knockout_opened_at: string | null;
        knockout_locked_at: string | null;
      }
    | null
    | undefined;
}

function isLockedAt(time: string | null | undefined) {
  return Boolean(time && new Date(time) <= new Date());
}

const groupNameSorter = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

export default async function PredictionsPage({
  params
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { group } = await getGroupContext(groupId);
  const settings = settingsFor(group) ?? {
    group_stage_prediction_mode: "table",
    knockout_prediction_mode: "winner_bracket",
    include_third_place: false,
    knockout_opened_at: null,
    knockout_locked_at: null
  };
  const tournament = Array.isArray(group.tournaments) ? group.tournaments[0] : group.tournaments;
  const maxThirdPlaceAdvancers = tournament?.group_best_third_place_advancers ?? 0;

  const { matches, tablePredictions, matchPredictions, knockoutPredictions } =
    await getPredictionPageData(groupId);

  const allMatches = matches as MatchRow[];
  const groupMatches = allMatches.filter((match) => match.stage_type === "group");
  const knockoutMatches = allMatches.filter((match) => match.stage_type === "knockout");
  const firstGroupKickoff = groupMatches.find((match) => match.kickoff_time)?.kickoff_time ?? null;
  const groupLocked = isLockedAt(firstGroupKickoff);
  const knockoutLocked = isLockedAt(settings.knockout_locked_at);
  const tablePredictionByGroup = new Map(
    (tablePredictions ?? []).map((prediction) => [prediction.group_name, prediction])
  );
  const matchPredictionByMatch = new Map(
    (matchPredictions ?? []).map((prediction) => [prediction.match_id, prediction])
  );
  const knockoutPredictionByMatch = new Map(
    (knockoutPredictions ?? [])
      .filter((prediction) => prediction.source_match_id)
      .map((prediction) => [prediction.source_match_id, prediction])
  );
  const teamsByGroup = new Map<string, TeamOption[]>();

  for (const match of groupMatches) {
    const groupName = match.group_name ?? "Group";
    const list = teamsByGroup.get(groupName) ?? [];
    for (const team of [
      match.home_team_id
        ? {
            id: match.home_team_id,
            name: match.home_team_name,
            flag: flagForTeam(match.home_team_name),
          }
        : null,
      match.away_team_id
        ? {
            id: match.away_team_id,
            name: match.away_team_name,
            flag: flagForTeam(match.away_team_name),
          }
        : null
    ]) {
      if (team && !list.some((item) => item.id === team.id)) list.push(team);
    }
    teamsByGroup.set(groupName, list);
  }
  const tableGroups = [...teamsByGroup.entries()]
    .sort(([leftGroupName], [rightGroupName]) => groupNameSorter.compare(leftGroupName, rightGroupName))
    .map(([groupName, teams]) => {
      const prediction = tablePredictionByGroup.get(groupName);
      return {
        groupName,
        teams,
        rankedTeamIds: prediction?.ranked_team_ids ?? null,
        thirdPlaceAdvances: prediction?.third_place_advances ?? false,
        points: prediction?.points ?? null
      };
    });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Group stage</CardTitle>
            <Badge variant={groupLocked ? "secondary" : "warm"}>
              {groupLocked ? "Locked" : "Open until first kickoff"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {firstGroupKickoff ? (
            <p className="text-sm text-muted-foreground">
              Locks <ClientDateTime value={firstGroupKickoff} />.
            </p>
          ) : null}
          {settings.group_stage_prediction_mode === "table" ? (
            tableGroups.length ? (
              <GroupTablePredictions
                groupId={groupId}
                locked={groupLocked}
                groups={tableGroups}
                maxThirdPlaceAdvancers={maxThirdPlaceAdvancers}
                showPoints={groupLocked}
              />
            ) : (
              <EmptyState
                title="Group fixtures are not loaded yet"
                description="Run tournament sync after the fixture source has group-stage teams and groups. If you already synced, the source may not have published the final group draw yet."
              />
            )
          ) : settings.group_stage_prediction_mode === "match_outcome" ? (
            <MatchOutcomeMode
              groupId={groupId}
              locked={groupLocked}
              matches={groupMatches}
              predictionByMatch={matchPredictionByMatch}
            />
          ) : (
            <ExactScoreMode
              groupId={groupId}
              locked={groupLocked}
              matches={groupMatches}
              predictionByMatch={matchPredictionByMatch}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Knockout bracket</CardTitle>
            <Badge variant={settings.knockout_opened_at && !knockoutLocked ? "warm" : "secondary"}>
              {!settings.knockout_opened_at ? "Not open" : knockoutLocked ? "Locked" : "Open"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!settings.knockout_opened_at ? (
            <EmptyState
              title="Knockout predictions are not open yet"
              description="An admin opens the bracket after group play when the knockout fixtures are known."
            />
          ) : knockoutMatches.length ? (
            settings.knockout_prediction_mode === "exact_score" ? (
              <ExactScoreMode
                groupId={groupId}
                locked={knockoutLocked}
                matches={
                  settings.include_third_place
                    ? knockoutMatches
                    : knockoutMatches.filter((match) => match.round_key !== "third_place")
                }
                predictionByMatch={matchPredictionByMatch}
                phase="knockout"
              />
            ) : (
              <KnockoutMode
                groupId={groupId}
                locked={knockoutLocked}
                includeThirdPlace={settings.include_third_place}
                matches={knockoutMatches}
                predictionByMatch={knockoutPredictionByMatch}
              />
            )
          ) : (
            <EmptyState
              title="No knockout fixtures yet"
              description="Sync the tournament after group play to load the bracket."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function MatchOutcomeMode({
  groupId,
  locked,
  matches,
  predictionByMatch
}: {
  groupId: string;
  locked: boolean;
  matches: MatchRow[];
  predictionByMatch: Map<string, { predicted_outcome: string | null; points: number }>;
}) {
  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const prediction = predictionByMatch.get(match.id);
        return (
          <form key={match.id} action={saveMatchPrediction} className="grid gap-3 rounded-3xl bg-muted p-4 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="predictionPhase" value="group" />
            <div>
              <p className="font-black">
                {match.home_team_name} vs {match.away_team_name}
              </p>
              <p className="text-xs text-muted-foreground">{match.group_name ?? match.stage}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {prediction ? <Badge variant="outline">{prediction.points} pts</Badge> : null}
              <Select name="predictedOutcome" defaultValue={prediction?.predicted_outcome ?? undefined} disabled={locked}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Pick winner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">{match.home_team_name}</SelectItem>
                  <SelectItem value="draw">Draw</SelectItem>
                  <SelectItem value="away">{match.away_team_name}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={locked}>Save</Button>
            </div>
          </form>
        );
      })}
    </div>
  );
}

function ExactScoreMode({
  groupId,
  locked,
  matches,
  predictionByMatch,
  phase = "group"
}: {
  groupId: string;
  locked: boolean;
  matches: MatchRow[];
  predictionByMatch: Map<string, { home_score: number | null; away_score: number | null; points: number }>;
  phase?: "group" | "knockout";
}) {
  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const prediction = predictionByMatch.get(match.id);
        return (
          <form key={match.id} action={saveMatchPrediction} className="grid gap-3 rounded-3xl bg-muted p-4 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="predictionPhase" value={phase} />
            <div>
              <p className="font-black">
                {match.home_team_name} vs {match.away_team_name}
              </p>
              <p className="text-xs text-muted-foreground">{match.group_name ?? match.stage}</p>
            </div>
            <div className="flex items-center gap-2">
              {prediction ? <Badge variant="outline">{prediction.points} pts</Badge> : null}
              <Input name="homeScore" type="number" min="0" className="w-16 text-center" defaultValue={prediction?.home_score ?? ""} disabled={locked} />
              <span className="font-black">-</span>
              <Input name="awayScore" type="number" min="0" className="w-16 text-center" defaultValue={prediction?.away_score ?? ""} disabled={locked} />
              <Button type="submit" disabled={locked}>Save</Button>
            </div>
          </form>
        );
      })}
    </div>
  );
}

function KnockoutMode({
  groupId,
  locked,
  includeThirdPlace,
  matches,
  predictionByMatch
}: {
  groupId: string;
  locked: boolean;
  includeThirdPlace: boolean;
  matches: MatchRow[];
  predictionByMatch: Map<string, { predicted_team_id: string; points: number }>;
}) {
  const visibleMatches = includeThirdPlace
    ? matches
    : matches.filter((match) => match.round_key !== "third_place");

  return (
    <div className="space-y-3">
      {visibleMatches.map((match, index) => {
        const prediction = predictionByMatch.get(match.id);
        return (
          <form key={match.id} action={saveKnockoutPrediction} className="grid gap-3 rounded-3xl bg-muted p-4 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="roundKey" value={match.round_key} />
            <input type="hidden" name="slotIndex" value={index} />
            <input type="hidden" name="sourceMatchId" value={match.id} />
            <div>
              <p className="font-black">
                {match.home_team_name} vs {match.away_team_name}
              </p>
              <p className="text-xs text-muted-foreground">{match.stage}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {prediction ? <Badge variant="outline">{prediction.points} pts</Badge> : null}
              <Select name="predictedTeamId" defaultValue={prediction?.predicted_team_id} disabled={locked}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Pick winner" />
                </SelectTrigger>
                <SelectContent>
                  {match.home_team_id ? (
                    <SelectItem value={match.home_team_id}>{match.home_team_name}</SelectItem>
                  ) : null}
                  {match.away_team_id ? (
                    <SelectItem value={match.away_team_id}>{match.away_team_name}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={locked}>
                <Trophy className="h-4 w-4" />
                Save
              </Button>
            </div>
          </form>
        );
      })}
    </div>
  );
}
