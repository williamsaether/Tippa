"use client";

import { useMemo, useRef, useState } from "react";
import { saveKnockoutBracketSnapshot } from "@/app/actions/predictions";
import { KnockoutBracketView } from "@/components/knockout-bracket-view";
import {
  resolveKnockoutChoices,
  type KnockoutPickState,
  KnockoutBracketMatch,
  KnockoutBracketRound,
  KnockoutBracketTeam
} from "@/lib/knockout-bracket";

type PredictionRow = {
  round_key: string;
  slot_index: number;
  source_match_id: string | null;
  predicted_team_id: string;
  points: number;
};

const roundRank: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 3,
  semi_final: 4,
  third_place: 5,
  final: 6
};

function predictionKey(match: KnockoutBracketMatch) {
  return `${match.roundKey}:${match.slotIndex}`;
}

function initialPicks(rounds: KnockoutBracketRound[], predictions: PredictionRow[]) {
  const bySourceMatch = new Map(
    predictions
      .filter((prediction) => prediction.source_match_id)
      .map((prediction) => [prediction.source_match_id as string, prediction])
  );
  const byRoundSlot = new Map(
    predictions.map((prediction) => [`${prediction.round_key}:${prediction.slot_index}`, prediction])
  );
  const matchesByNumber = new Map(
    rounds.flatMap((round) => round.matches.map((match) => [match.matchNumber, match]))
  );
  const teamById = new Map(
    rounds.flatMap((round) =>
      round.matches.flatMap((match) =>
        match.slots.flatMap((slot) => (slot.team ? [[slot.team.id, slot.team] as const] : []))
      )
    )
  );
  const picks: KnockoutPickState = {};

  for (const round of rounds) {
    for (const match of round.matches) {
      const prediction = bySourceMatch.get(match.sourceMatchId) ?? byRoundSlot.get(predictionKey(match));
      if (!prediction) continue;
      const team =
        resolveKnockoutChoices(match, matchesByNumber, picks).find(
          (candidate) => candidate?.id === prediction.predicted_team_id
        ) ?? teamById.get(prediction.predicted_team_id);
      if (team) picks[match.matchNumber] = team;
    }
  }

  return picks;
}

function snapshotEntries(
  rounds: KnockoutBracketRound[],
  picks: KnockoutPickState
) {
  return rounds.flatMap((round) =>
    round.matches.flatMap((match) => {
      const pick = picks[match.matchNumber];
      if (!pick) return [];

      return [
        {
          roundKey: match.roundKey,
          slotIndex: match.slotIndex,
          sourceMatchId: match.sourceMatchId,
          predictedTeamId: pick.id
        }
      ];
    })
  );
}

export function KnockoutBracketPredictions({
  groupId,
  locked,
  rounds,
  predictions
}: {
  groupId: string;
  locked: boolean;
  rounds: KnockoutBracketRound[];
  predictions: PredictionRow[];
}) {
  const saveQueueRef = useRef(Promise.resolve());
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState(() => initialPicks(rounds, predictions));
  const picksRef = useRef(picks);
  const matchesByNumber = useMemo(
    () => new Map(rounds.flatMap((round) => round.matches.map((match) => [match.matchNumber, match]))),
    [rounds]
  );

  function pickWinner(match: KnockoutBracketMatch, team: KnockoutBracketTeam) {
    if (locked) return;
    setError(null);
    const nextSnapshot = { ...picksRef.current, [match.matchNumber]: team };
    for (const laterMatch of matchesByNumber.values()) {
      if (roundRank[laterMatch.roundKey] > roundRank[match.roundKey]) {
        delete nextSnapshot[laterMatch.matchNumber];
      }
    }
    picksRef.current = nextSnapshot;
    setPicks(nextSnapshot);

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("entries", JSON.stringify(snapshotEntries(rounds, nextSnapshot)));

    setSavingCount((count) => count + 1);
    const saveJob = saveQueueRef.current.then(async () => {
      try {
        await saveKnockoutBracketSnapshot(formData);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save winner pick.");
      } finally {
        setSavingCount((count) => Math.max(0, count - 1));
      }
    });
    saveQueueRef.current = saveJob.catch(() => undefined);
  }

  return (
    <div className="space-y-3">
      <KnockoutBracketView
        rounds={rounds}
        picks={picks}
        showPoints={false}
        locked={locked}
        onPick={pickWinner}
      />

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      {locked ? (
        <p className="text-sm text-muted-foreground">Bracket picks are locked.</p>
      ) : savingCount > 0 ? (
        <p className="text-sm text-muted-foreground">Saving picks...</p>
      ) : (
        <p className="text-sm text-muted-foreground">Pick a team to advance it through your bracket.</p>
      )}
    </div>
  );
}
