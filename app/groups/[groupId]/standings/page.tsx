import { ArrowRight } from "lucide-react";
import { KnockoutBracketView } from "@/components/knockout-bracket-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGroupContext, getStandingsPageData } from "@/lib/data";
import {
  buildKnockoutBracket,
  type KnockoutBracketMatch,
  type KnockoutBracketRound,
  type KnockoutPickState
} from "@/lib/knockout-bracket";
import { scoreSettingsFromRow } from "@/lib/scoring";
import { calculateGroupStandings } from "@/lib/tournaments/standings";
import { cn } from "@/lib/utils";

const groupNameSorter = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type TablePrediction = {
  user_id: string;
  group_name: string;
  ranked_team_ids: string[];
  third_place_advances: boolean;
  points: number;
};

type KnockoutPrediction = {
  user_id: string;
  round_key: string;
  slot_index: number;
  source_match_id: string | null;
  predicted_team_id: string;
  points: number;
};

type MatchRow = {
  id: string;
  external_id: string | null;
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

export default async function StandingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { group, user, members } = await getGroupContext(groupId);
  const { matches, teams, predictions, knockoutPredictions } = await getStandingsPageData(groupId);
  const tournament = Array.isArray(group.tournaments) ? group.tournaments[0] : group.tournaments;
  const settingsRow = Array.isArray(group.group_prediction_settings)
    ? group.group_prediction_settings[0]
    : group.group_prediction_settings;
  const settings = scoreSettingsFromRow(settingsRow as never);
  const directAdvancers = tournament?.group_direct_advancers ?? 2;
  const pageMatches = matches as MatchRow[];
  const groupMatches = pageMatches.filter((match) => match.stage_type === "group");
  const knockoutMatches = pageMatches.filter((match) => match.stage_type === "knockout");
  const includeThirdPlace = Boolean(settingsRow?.include_third_place);
  const knockoutBracket = buildKnockoutBracket({ knockoutMatches, groupMatches, includeThirdPlace });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const typedPredictions = predictions as TablePrediction[];
  const typedKnockoutPredictions = knockoutPredictions as KnockoutPrediction[];
  const memberNameByUserId = new Map(
    members.map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return [member.user_id, member.display_name || profile?.display_name || "Pool member"];
    })
  );
  const membersInDisplayOrder = [...members].sort((left, right) => {
    if (left.user_id === user.id) return -1;
    if (right.user_id === user.id) return 1;
    return (memberNameByUserId.get(left.user_id) ?? "").localeCompare(
      memberNameByUserId.get(right.user_id) ?? ""
    );
  });
  const matchesByGroup = new Map<string, MatchRow[]>();

  for (const match of groupMatches) {
    if (!match.group_name) continue;
    const groupMatches = matchesByGroup.get(match.group_name) ?? [];
    groupMatches.push(match);
    matchesByGroup.set(match.group_name, groupMatches);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Latest standings</CardTitle>
          <CardDescription>
            Completed results from the latest sync. Member predictions appear after group-stage predictions lock.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <ScoreRule label="Exact position" value={settings.tableExactPositionPoints} />
          <ScoreRule label="Correct advancement status" value={settings.tableAdvancingStatusPoints} />
          <ScoreRule label="Correct group winner bonus" value={settings.tableGroupWinnerBonus} />
        </CardContent>
      </Card>

      <details open className="rounded-3xl border bg-card text-card-foreground shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-black [&::-webkit-details-marker]:hidden">
          <span>Group stage standings</span>
          <span className="text-xs font-bold text-muted-foreground">
            {[...matchesByGroup.keys()].length} groups
          </span>
        </summary>
        <div className="grid gap-4 p-5 pt-0 lg:grid-cols-2">
          {[...matchesByGroup.entries()]
            .sort(([left], [right]) => groupNameSorter.compare(left, right))
            .map(([cupGroupName, groupMatches]) => {
              const standings = calculateGroupStandings(groupMatches, { includeTeamsWithoutResults: true });
              const memberPredictions = typedPredictions
                .filter((entry) => entry.group_name === cupGroupName)
                .sort((left, right) => {
                  if (left.user_id === user.id) return -1;
                  if (right.user_id === user.id) return 1;
                  return (memberNameByUserId.get(left.user_id) ?? "").localeCompare(
                    memberNameByUserId.get(right.user_id) ?? ""
                  );
                });
              const ownPrediction = memberPredictions.find((entry) => entry.user_id === user.id);
              const otherPredictions = memberPredictions.filter((entry) => entry.user_id !== user.id);

              return (
                <Card key={cupGroupName}>
                  <CardHeader className="p-4 pb-3">
                    <CardTitle>{cupGroupName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-0">
                    <StandingsTable
                      rows={standings.map((standing, index) => ({
                        teamId: standing.teamId,
                        rank: index + 1,
                        played: standing.played,
                        points: standing.points,
                        advances: index < directAdvancers,
                        predictedTeamId: ownPrediction?.ranked_team_ids[index] ?? null,
                        predictedStatus:
                          index === directAdvancers && ownPrediction?.third_place_advances ? "third" : "none"
                      }))}
                      teamById={teamById}
                    />
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Your prediction: {ownPrediction?.points ?? 0} pts</span>
                      <span>Top {directAdvancers} advance</span>
                    </div>
                    <details className="rounded-2xl border bg-muted/20">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-black">
                        Other predictions ({otherPredictions.length})
                      </summary>
                      <div className="grid gap-2 border-t p-3 sm:grid-cols-2">
                        {otherPredictions.map((entry) => (
                          <MemberPredictionTable
                            key={entry.user_id}
                            title={memberNameByUserId.get(entry.user_id) ?? "Pool member"}
                            points={entry.points}
                            teamIds={entry.ranked_team_ids}
                            teamById={teamById}
                            directAdvancers={directAdvancers}
                            thirdPlaceAdvances={entry.third_place_advances}
                          />
                        ))}
                        {otherPredictions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Other members become visible after predictions lock.
                          </p>
                        ) : null}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </details>

      <KnockoutPredictions
        rounds={knockoutBracket}
        predictions={typedKnockoutPredictions}
        members={membersInDisplayOrder.map((member) => ({
          userId: member.user_id,
          name: member.user_id === user.id ? "You" : memberNameByUserId.get(member.user_id) ?? "Pool member"
        }))}
        teamById={teamById}
      />
    </div>
  );
}

type CompactRow = {
  teamId: string;
  rank: number;
  played: number;
  points: number;
  advances: boolean;
  predictedTeamId: string | null;
  predictedStatus: "direct" | "third" | "none";
};

function StandingsTable({
  rows,
  teamById
}: {
  rows: CompactRow[];
  teamById: Map<string, { id: string; name: string; flag_emoji: string | null }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-background">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="truncate text-sm font-black">Latest standings</h3>
      </div>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2rem_2.5rem_3.25rem] items-center bg-muted/40 py-1.5 text-center text-[10px] font-black uppercase text-muted-foreground">
        <span className="pl-3">#</span>
        <span className="pl-1 text-left">Team</span>
        <span>P</span>
        <span>Pts</span>
        <span>Your pick</span>
      </div>
      {rows.map((row) => {
        const team = teamById.get(row.teamId);
        return (
          <div
            key={row.teamId}
            className={cn(
              "grid min-h-10 grid-cols-[2.25rem_minmax(0,1fr)_2rem_2.5rem_3.25rem] items-center border-t py-2 text-center text-sm",
              row.advances && "bg-emerald-50/70"
            )}
          >
            <span className="pl-3 font-black">{row.rank}</span>
            <span className="min-w-0 truncate pl-1 text-left font-bold">
              {team?.flag_emoji ? <span className="mr-2" aria-hidden="true">{team.flag_emoji}</span> : null}
              {team?.name ?? "Unknown team"}
            </span>
            <span>{row.played}</span>
            <span className="font-black">{row.points}</span>
            <span
              className={cn(
                "-my-2 flex min-h-10 self-stretch items-center justify-center text-xl leading-none",
                row.predictedStatus === "third" && "bg-sky-50/90"
              )}
              title={row.predictedTeamId ? teamById.get(row.predictedTeamId)?.name ?? "Unknown team" : "No prediction"}
              aria-label={row.predictedTeamId ? teamById.get(row.predictedTeamId)?.name ?? "Unknown team" : "No prediction"}
            >
              {row.predictedTeamId ? teamById.get(row.predictedTeamId)?.flag_emoji ?? "⚑" : "-"}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function MemberPredictionTable({
  title,
  points,
  teamIds,
  teamById,
  directAdvancers,
  thirdPlaceAdvances
}: {
  title: string;
  points: number;
  teamIds: string[];
  teamById: Map<string, { id: string; name: string; flag_emoji: string | null }>;
  directAdvancers: number;
  thirdPlaceAdvances: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="min-w-0 truncate text-sm font-black">{title}</span>
        <Badge variant="outline" className="shrink-0 px-2">{points} pts</Badge>
      </div>
      {teamIds.map((teamId, index) => {
        const team = teamById.get(teamId);
        const directAdvancer = index < directAdvancers;
        const thirdPlaceAdvancer = index === directAdvancers && thirdPlaceAdvances;
        return (
          <div
            key={teamId}
            className={cn(
              "grid grid-cols-[1.5rem_1.75rem_minmax(0,1fr)] items-center border-t px-3 py-2 text-sm first:border-t-0",
              directAdvancer && "bg-emerald-50/80",
              thirdPlaceAdvancer && "bg-sky-50/90"
            )}
          >
            <span className="font-black">{index + 1}</span>
            <span className="text-lg leading-none" aria-hidden="true">{team?.flag_emoji ?? "⚑"}</span>
            <span className="truncate font-bold">{team?.name ?? "Unknown team"}</span>
          </div>
        );
      })}
    </section>
  );
}

function KnockoutPredictions({
  rounds,
  predictions,
  members,
  teamById
}: {
  rounds: KnockoutBracketRound[];
  predictions: KnockoutPrediction[];
  members: { userId: string; name: string }[];
  teamById: Map<string, { id: string; name: string; flag_emoji: string | null }>;
}) {
  const predictionsByUserId = new Map<string, KnockoutPrediction[]>();
  for (const prediction of predictions) {
    predictionsByUserId.set(prediction.user_id, [
      ...(predictionsByUserId.get(prediction.user_id) ?? []),
      prediction
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knockout predictions</CardTitle>
        <CardDescription>Your bracket is shown first. Other members are listed underneath.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((member, index) => {
          const memberPredictions = predictionsByUserId.get(member.userId) ?? [];
          return (
            <details
              key={member.userId}
              open={index === 0}
              className="overflow-hidden rounded-2xl border bg-background"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-black [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">{member.name}</span>
                <Badge variant="outline" className="shrink-0">
                  {sumPoints(memberPredictions)} pts
                </Badge>
              </summary>
              <div className="border-t p-3">
                {memberPredictions.length ? (
                  <MemberKnockoutBracket
                    rounds={rounds}
                    predictions={memberPredictions}
                    teamById={teamById}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No knockout predictions visible yet.</p>
                )}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MemberKnockoutBracket({
  rounds,
  predictions,
  teamById
}: {
  rounds: KnockoutBracketRound[];
  predictions: KnockoutPrediction[];
  teamById: Map<string, { id: string; name: string; flag_emoji: string | null }>;
}) {
  const { picks, pointsByMatch } = memberKnockoutState(rounds, predictions, teamById);

  return (
    <KnockoutBracketView
      rounds={rounds}
      picks={picks}
      pointsByMatch={pointsByMatch}
      markLosers
      emptyPickLabel="No pick"
    />
  );
}

function predictionForMatch(match: KnockoutBracketMatch, predictions: KnockoutPrediction[]) {
  const bySourceMatch = new Map(
    predictions
      .filter((prediction) => prediction.source_match_id)
      .map((prediction) => [prediction.source_match_id as string, prediction])
  );
  const byRoundSlot = new Map(
    predictions.map((prediction) => [`${prediction.round_key}:${prediction.slot_index}`, prediction])
  );

  return (
    bySourceMatch.get(match.sourceMatchId) ??
    byRoundSlot.get(`${match.roundKey}:${match.slotIndex}`) ??
    null
  );
}

function memberKnockoutState(
  rounds: KnockoutBracketRound[],
  predictions: KnockoutPrediction[],
  teamById: Map<string, { id: string; name: string; flag_emoji: string | null }>
) {
  const picks: KnockoutPickState = {};
  const pointsByMatch: Record<number, number> = {};

  for (const round of rounds) {
    for (const match of round.matches) {
      const prediction = predictionForMatch(match, predictions);
      if (!prediction) continue;
      const team = teamById.get(prediction.predicted_team_id);
      if (!team) continue;
      picks[match.matchNumber] = {
        id: team.id,
        name: team.name,
        flag: team.flag_emoji ?? "⚑"
      };
      pointsByMatch[match.matchNumber] = prediction.points ?? 0;
    }
  }

  return { picks, pointsByMatch };
}

function sumPoints(predictions: KnockoutPrediction[]) {
  return predictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0);
}

function ScoreRule({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3 sm:block">
      <span className="font-bold">{label}</span>
      <span className="flex items-center gap-1 font-black text-[var(--tippa-primary)] sm:mt-1">
        <ArrowRight className="h-3.5 w-3.5" /> {value} pts
      </span>
    </div>
  );
}
