"use client";

import { Badge } from "@/components/ui/badge";
import {
  resolveKnockoutChoices,
  type KnockoutBracketMatch,
  type KnockoutBracketRound,
  type KnockoutBracketTeam,
  type KnockoutPickState
} from "@/lib/knockout-bracket";
import { cn } from "@/lib/utils";

type KnockoutBracketViewProps = {
  rounds: KnockoutBracketRound[];
  picks: KnockoutPickState;
  pointsByMatch?: Record<number, number>;
  showPoints?: boolean;
  locked?: boolean;
  onPick?: (match: KnockoutBracketMatch, team: KnockoutBracketTeam) => void;
  markLosers?: boolean;
  emptyPickLabel?: string;
  className?: string;
};

const bracketSlots = 16;

function teamLabel(team: KnockoutBracketTeam) {
  return `${team.flag} ${team.name}`;
}

function matchGridPlacement(matchIndex: number, matchCount: number) {
  const rowSpan = bracketSlots / matchCount;
  return {
    rowSpan,
    rowStart: 2 + matchIndex * rowSpan,
    center: 2 + matchIndex * rowSpan + rowSpan / 2
  };
}

function orderRoundsByBracket(mainRounds: KnockoutBracketRound[]) {
  const orderByRoundIndex = new Map<number, number[]>();
  const lastRoundIndex = mainRounds.length - 1;
  orderByRoundIndex.set(
    lastRoundIndex,
    mainRounds[lastRoundIndex]?.matches.map((match) => match.matchNumber) ?? []
  );

  for (let roundIndex = lastRoundIndex; roundIndex > 0; roundIndex -= 1) {
    const round = mainRounds[roundIndex];
    const previousRound = mainRounds[roundIndex - 1];
    if (!round || !previousRound) continue;

    const roundMatchByNumber = new Map(round.matches.map((match) => [match.matchNumber, match] as const));
    const previousMatchNumbers = new Set(previousRound.matches.map((match) => match.matchNumber));
    const orderedPreviousMatchNumbers: number[] = [];

    for (const matchNumber of orderByRoundIndex.get(roundIndex) ?? []) {
      const match = roundMatchByNumber.get(matchNumber);
      if (!match) continue;

      for (const slot of match.slots) {
        const sourceMatchNumber = slot.source?.matchNumber;
        if (
          sourceMatchNumber &&
          previousMatchNumbers.has(sourceMatchNumber) &&
          !orderedPreviousMatchNumbers.includes(sourceMatchNumber)
        ) {
          orderedPreviousMatchNumbers.push(sourceMatchNumber);
        }
      }
    }

    const remainingMatchNumbers = previousRound.matches
      .map((match) => match.matchNumber)
      .filter((matchNumber) => !orderedPreviousMatchNumbers.includes(matchNumber));
    orderByRoundIndex.set(roundIndex - 1, [...orderedPreviousMatchNumbers, ...remainingMatchNumbers]);
  }

  return mainRounds.map((round, roundIndex) => {
    const matchOrder = orderByRoundIndex.get(roundIndex);
    if (!matchOrder) return round;

    const orderIndexByMatchNumber = new Map(matchOrder.map((matchNumber, index) => [matchNumber, index] as const));
    return {
      ...round,
      matches: [...round.matches].sort(
        (left, right) =>
          (orderIndexByMatchNumber.get(left.matchNumber) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndexByMatchNumber.get(right.matchNumber) ?? Number.MAX_SAFE_INTEGER)
      )
    };
  });
}

function MatchNode({
  match,
  choices,
  selected,
  points,
  showPoints,
  locked,
  onPick,
  markLosers,
  emptyPickLabel = "No pick",
  hasLeftLine,
  hasRightLine
}: {
  match: KnockoutBracketMatch;
  choices: [KnockoutBracketTeam | null, KnockoutBracketTeam | null];
  selected: KnockoutBracketTeam | undefined;
  points: number | undefined;
  showPoints: boolean;
  locked: boolean;
  onPick?: (match: KnockoutBracketMatch, team: KnockoutBracketTeam) => void;
  markLosers: boolean;
  emptyPickLabel?: string;
  hasLeftLine: boolean;
  hasRightLine: boolean;
}) {
  const interactive = Boolean(onPick);
  const selectedStillValid = choices.some((team) => team?.id === selected?.id);

  return (
    <div
      className={cn(
        "relative w-full rounded-lg border bg-muted/35 px-1.5 py-1",
        hasLeftLine &&
          "before:absolute before:-left-4 before:top-1/2 before:h-px before:w-4 before:bg-border",
        hasRightLine &&
          "after:absolute after:-right-4 after:top-1/2 after:h-px after:w-4 after:bg-border"
      )}
    >
      <div
        className={cn(
          "mb-1 flex items-center justify-between gap-2 px-0.5 text-[10px] text-muted-foreground",
          showPoints ? "h-5" : "h-3.5"
        )}
      >
        <span className="font-semibold">M{match.matchNumber}</span>
        {showPoints ? (
          <Badge
            variant="outline"
            className={cn(
              "h-5 w-14 shrink-0 justify-center px-0 text-[9px] tabular-nums",
              points == null && "invisible"
            )}
          >
            {points ?? 0} pts
          </Badge>
        ) : null}
      </div>

      <div className="space-y-0.5">
        {choices.map((team, index) => {
          const fallbackSelected = Boolean(selected && !choices.some(Boolean) && index === 0);
          const displayTeam = team ?? (fallbackSelected ? selected : null);
          const active = Boolean(fallbackSelected || (selectedStillValid && selected?.id === displayTeam?.id));
          const lost = markLosers && Boolean(selected && displayTeam && selected.id !== displayTeam.id);
          const disabled = locked || !team;
          const rowClassName = cn(
            "flex h-5 w-full min-w-0 items-center rounded-md px-1.5 text-left text-xs font-black leading-none",
            active && interactive && "bg-primary text-primary-foreground shadow-sm",
            active && !interactive && "text-foreground",
            !active && interactive && "bg-background/75 text-foreground hover:bg-background",
            !active && !interactive && "text-foreground",
            lost && "opacity-50 grayscale line-through decoration-2",
            !displayTeam && "text-muted-foreground"
          );

          const content = (
            <span className="truncate">
              {displayTeam ? teamLabel(displayTeam) : selected && index === 0 ? emptyPickLabel : "TBD"}
            </span>
          );

          if (!interactive) {
            return (
              <div key={`${match.matchNumber}-${match.slots[index].label}`} className={rowClassName}>
                {content}
              </div>
            );
          }

          return (
            <button
              key={`${match.matchNumber}-${match.slots[index].label}`}
              type="button"
              disabled={disabled}
              onClick={() => team && onPick?.(match, team)}
              className={cn(
                rowClassName,
                "transition disabled:cursor-not-allowed disabled:bg-muted/70 disabled:text-muted-foreground"
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function KnockoutBracketView({
  rounds,
  picks,
  pointsByMatch = {},
  showPoints = true,
  locked = false,
  onPick,
  markLosers = false,
  emptyPickLabel,
  className
}: KnockoutBracketViewProps) {
  const mainRounds = orderRoundsByBracket(rounds.filter((round) => round.roundKey !== "third_place"));
  const thirdPlaceRound = rounds.find((round) => round.roundKey === "third_place");
  const matchesByNumber = new Map(
    rounds.flatMap((round) => round.matches.map((match) => [match.matchNumber, match] as const))
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-[1180px] grid-cols-[repeat(5,minmax(190px,1fr))] gap-x-8 gap-y-1"
          style={{ gridTemplateRows: `auto repeat(${bracketSlots}, auto)` }}
        >
          {mainRounds.map((round, roundIndex) => (
            <h3
              key={round.roundKey}
              className="rounded-xl bg-muted/55 px-3 py-1.5 text-sm font-black"
              style={{ gridColumn: roundIndex + 1, gridRow: 1 }}
            >
              {round.title}
            </h3>
          ))}

          {mainRounds.flatMap((round, roundIndex) =>
            round.matches.map((match, matchIndex) => {
              const choices = resolveKnockoutChoices(match, matchesByNumber, picks);
              const { rowSpan, rowStart } = matchGridPlacement(matchIndex, round.matches.length);
              const previousRound = mainRounds[roundIndex - 1];
              const sourceCenters = previousRound
                ? match.slots
                    .map((slot) => slot.source?.matchNumber)
                    .filter((matchNumber): matchNumber is number => typeof matchNumber === "number")
                    .map((matchNumber) =>
                      previousRound.matches.findIndex((candidate) => candidate.matchNumber === matchNumber)
                    )
                    .filter((sourceIndex) => sourceIndex >= 0)
                    .map((sourceIndex) => matchGridPlacement(sourceIndex, previousRound.matches.length).center)
                : [];
              const connectorTop = sourceCenters.length >= 2 ? Math.min(...sourceCenters) : null;
              const connectorBottom = sourceCenters.length >= 2 ? Math.max(...sourceCenters) : null;

              return (
                <div
                  key={match.sourceMatchId}
                  className="relative flex items-center"
                  style={{
                    gridColumn: roundIndex + 1,
                    gridRow: `${rowStart} / span ${rowSpan}`
                  }}
                >
                  {connectorTop != null && connectorBottom != null ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-4 w-px rounded-full bg-border"
                      style={{
                        top: `calc(${((connectorTop - rowStart) / rowSpan) * 100}% + 0.5px)`,
                        height: `calc(${((connectorBottom - connectorTop) / rowSpan) * 100}% - 1px)`
                      }}
                    />
                  ) : null}
                  <MatchNode
                    match={match}
                    choices={choices}
                    selected={picks[match.matchNumber]}
                    points={pointsByMatch[match.matchNumber]}
                    showPoints={showPoints}
                    locked={locked}
                    onPick={onPick}
                    markLosers={markLosers}
                    emptyPickLabel={emptyPickLabel}
                    hasLeftLine={roundIndex > 0}
                    hasRightLine={roundIndex < mainRounds.length - 1}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {thirdPlaceRound ? (
        <div className="max-w-sm space-y-2">
          <h3 className="rounded-xl bg-muted/55 px-3 py-1.5 text-sm font-black">{thirdPlaceRound.title}</h3>
          {thirdPlaceRound.matches.map((match) => (
            <MatchNode
              key={match.sourceMatchId}
              match={match}
              choices={resolveKnockoutChoices(match, matchesByNumber, picks)}
              selected={picks[match.matchNumber]}
              points={pointsByMatch[match.matchNumber]}
              showPoints={showPoints}
              locked={locked}
              onPick={onPick}
              markLosers={markLosers}
              emptyPickLabel={emptyPickLabel}
              hasLeftLine={false}
              hasRightLine={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
