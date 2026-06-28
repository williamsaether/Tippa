import { createServiceClient } from "@/lib/supabase/server";
import { flagForTeam } from "@/lib/team-flags";
import { openFootballWorldCup2026Adapter } from "@/lib/tournaments/adapters/openfootball-worldcup-2026";

type MatchRow = {
  id: string;
  external_id: string;
  round_key: string;
  round_order: number;
  kickoff_time: string | null;
  home_team_name: string;
  away_team_name: string;
  updated_at: string | null;
};

type SourceMatch = Awaited<
  ReturnType<typeof openFootballWorldCup2026Adapter.fetchTournamentData>
>["matches"][number];

function matchNumberFromExternalId(externalId: string) {
  const match = externalId.match(/(?:^|-)(\d+)$/);
  return match ? Number(match[1]) : null;
}

function sourceScore(row: MatchRow, source: SourceMatch) {
  return (
    (row.external_id === source.externalId ? 1000 : 0) +
    (row.home_team_name === source.homeTeamName ? 100 : 0) +
    (row.away_team_name === source.awayTeamName ? 100 : 0) +
    (row.home_team_name !== "TBD" ? 10 : 0) +
    (row.away_team_name !== "TBD" ? 10 : 0)
  );
}

function pickCanonical(rows: MatchRow[], source: SourceMatch) {
  return [...rows].sort(
    (left, right) =>
      sourceScore(right, source) - sourceScore(left, source) ||
      (right.updated_at ?? "").localeCompare(left.updated_at ?? "")
  )[0];
}

async function main() {
  const supabase = createServiceClient();
  const source = await openFootballWorldCup2026Adapter.fetchTournamentData();
  const sourceKnockoutMatches = source.matches.filter((match) => match.stageType === "knockout");
  const sourceByNumber = new Map(
    sourceKnockoutMatches
      .map((match) => [matchNumberFromExternalId(match.externalId), match] as const)
      .filter((entry): entry is [number, SourceMatch] => Boolean(entry[0]))
  );

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("code", "world-cup-2026")
    .single();

  if (tournamentError) throw tournamentError;

  const teamNames = Array.from(
    new Set(
      source.matches
        .flatMap((match) => [match.homeTeamName, match.awayTeamName])
        .filter((name): name is string => Boolean(name) && name !== "TBD")
    )
  );

  const { error: teamsError } = await supabase.from("teams").upsert(
    teamNames.map((name) => ({
      tournament_id: tournament.id,
      name,
      short_name: name,
      flag_emoji: flagForTeam(name)
    })),
    { onConflict: "tournament_id,name" }
  );

  if (teamsError) throw teamsError;

  const { data: teams, error: teamsFetchError } = await supabase
    .from("teams")
    .select("id,name")
    .eq("tournament_id", tournament.id);

  if (teamsFetchError) throw teamsFetchError;
  const teamIdByName = new Map((teams ?? []).map((team) => [team.name, team.id]));

  const { data: existingMatches, error: matchesError } = await supabase
    .from("matches")
    .select("id,external_id,round_key,round_order,kickoff_time,home_team_name,away_team_name,updated_at")
    .eq("tournament_id", tournament.id)
    .eq("stage_type", "knockout");

  if (matchesError) throw matchesError;

  const existingByNumber = new Map<number, MatchRow[]>();
  for (const row of (existingMatches ?? []) as MatchRow[]) {
    const matchNumber = matchNumberFromExternalId(row.external_id);
    if (!matchNumber || !sourceByNumber.has(matchNumber)) continue;
    existingByNumber.set(matchNumber, [...(existingByNumber.get(matchNumber) ?? []), row]);
  }

  let updated = 0;
  let inserted = 0;
  let remappedPredictions = 0;
  let deleted = 0;

  for (const [matchNumber, sourceMatch] of sourceByNumber) {
    const existingRows = existingByNumber.get(matchNumber) ?? [];
    const canonical = existingRows.length ? pickCanonical(existingRows, sourceMatch) : null;
    const row = {
      tournament_id: tournament.id,
      external_id: sourceMatch.externalId,
      stage: sourceMatch.stage,
      group_name: sourceMatch.groupName ?? null,
      stage_type: sourceMatch.stageType,
      round_key: sourceMatch.roundKey,
      round_order: sourceMatch.roundOrder,
      home_team_id: teamIdByName.get(sourceMatch.homeTeamName) ?? null,
      away_team_id: teamIdByName.get(sourceMatch.awayTeamName) ?? null,
      home_team_name: sourceMatch.homeTeamName,
      away_team_name: sourceMatch.awayTeamName,
      kickoff_time: sourceMatch.kickoffTime,
      status: sourceMatch.status,
      home_score: sourceMatch.homeScore,
      away_score: sourceMatch.awayScore
    };

    let canonicalId = canonical?.id;

    if (canonical) {
      const { error: updateError } = await supabase.from("matches").update(row).eq("id", canonical.id);
      if (updateError) throw updateError;
      updated += 1;
    } else {
      const { data: insertedRow, error: insertError } = await supabase
        .from("matches")
        .insert(row)
        .select("id")
        .single();

      if (insertError) throw insertError;
      canonicalId = insertedRow.id;
      inserted += 1;
    }

    const duplicateIds = existingRows.map((item) => item.id).filter((id) => id !== canonicalId);
    for (const duplicateId of duplicateIds) {
      const { data: affected, error: predictionFetchError } = await supabase
        .from("knockout_prediction_entries")
        .select("id")
        .eq("source_match_id", duplicateId);

      if (predictionFetchError) throw predictionFetchError;

      const { error: remapError } = await supabase
        .from("knockout_prediction_entries")
        .update({ source_match_id: canonicalId })
        .eq("source_match_id", duplicateId);

      if (remapError) throw remapError;
      remappedPredictions += affected?.length ?? 0;
    }

    if (duplicateIds.length) {
      const { error: deleteError } = await supabase.from("matches").delete().in("id", duplicateIds);
      if (deleteError) throw deleteError;
      deleted += duplicateIds.length;
    }
  }

  const { data: counts, error: countError } = await supabase
    .from("matches")
    .select("round_key")
    .eq("tournament_id", tournament.id)
    .eq("stage_type", "knockout");

  if (countError) throw countError;

  const countsByRound = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.round_key] = (acc[row.round_key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        updated,
        inserted,
        remappedPredictions,
        deleted,
        countsByRound
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
