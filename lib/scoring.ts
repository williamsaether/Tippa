export type GroupStagePredictionMode = "table" | "match_outcome" | "exact_score";
export type KnockoutPredictionMode = "winner_bracket" | "exact_score";
export type ScoringPreset = "simple" | "balanced" | "high_stakes" | "custom";
export type MatchOutcome = "home" | "draw" | "away";
export type StageType = "group" | "knockout";
export type RoundKey =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

export type ScoreSettings = {
  tableExactPositionPoints: number;
  tableAdvancingStatusPoints: number;
  tableGroupWinnerBonus: number;
  matchOutcomePoints: number;
  exactScorePoints: number;
  correctGoalDifferencePoints: number;
  correctOutcomePoints: number;
  knockoutRoundOf32Points: number;
  knockoutRoundOf16Points: number;
  knockoutQuarterFinalPoints: number;
  knockoutSemiFinalPoints: number;
  knockoutChampionPoints: number;
  knockoutThirdPlacePoints: number;
};

export const scoringPresets: Record<Exclude<ScoringPreset, "custom">, ScoreSettings> = {
  simple: {
    tableExactPositionPoints: 1,
    tableAdvancingStatusPoints: 0,
    tableGroupWinnerBonus: 0,
    matchOutcomePoints: 1,
    exactScorePoints: 3,
    correctGoalDifferencePoints: 2,
    correctOutcomePoints: 1,
    knockoutRoundOf32Points: 1,
    knockoutRoundOf16Points: 2,
    knockoutQuarterFinalPoints: 3,
    knockoutSemiFinalPoints: 4,
    knockoutChampionPoints: 6,
    knockoutThirdPlacePoints: 2
  },
  balanced: {
    tableExactPositionPoints: 1,
    tableAdvancingStatusPoints: 0,
    tableGroupWinnerBonus: 0,
    matchOutcomePoints: 2,
    exactScorePoints: 4,
    correctGoalDifferencePoints: 3,
    correctOutcomePoints: 2,
    knockoutRoundOf32Points: 1,
    knockoutRoundOf16Points: 2,
    knockoutQuarterFinalPoints: 4,
    knockoutSemiFinalPoints: 8,
    knockoutChampionPoints: 16,
    knockoutThirdPlacePoints: 4
  },
  high_stakes: {
    tableExactPositionPoints: 2,
    tableAdvancingStatusPoints: 0,
    tableGroupWinnerBonus: 0,
    matchOutcomePoints: 2,
    exactScorePoints: 5,
    correctGoalDifferencePoints: 3,
    correctOutcomePoints: 2,
    knockoutRoundOf32Points: 2,
    knockoutRoundOf16Points: 4,
    knockoutQuarterFinalPoints: 8,
    knockoutSemiFinalPoints: 16,
    knockoutChampionPoints: 32,
    knockoutThirdPlacePoints: 8
  }
};

export const defaultScoreSettings = scoringPresets.balanced;

export type PredictionScoreInput = {
  homeScore: number;
  awayScore: number;
};

export type MatchScoreInput = {
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
};

export function outcomeForScore(homeScore: number, awayScore: number): MatchOutcome {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function calculateOutcomePoints(
  predictedOutcome: MatchOutcome,
  match: MatchScoreInput,
  settings: ScoreSettings = defaultScoreSettings
) {
  if (match.status !== "finished" || match.homeScore == null || match.awayScore == null) return 0;
  return predictedOutcome === outcomeForScore(match.homeScore, match.awayScore)
    ? settings.matchOutcomePoints
    : 0;
}

export function calculateExactScoreResult(
  prediction: PredictionScoreInput,
  match: MatchScoreInput,
  settings: ScoreSettings = defaultScoreSettings
) {
  if (match.status !== "finished" || match.homeScore == null || match.awayScore == null) {
    return { points: 0, exactScore: false, correctOutcome: false, correctGoalDifference: false };
  }

  const exactScore =
    prediction.homeScore === match.homeScore && prediction.awayScore === match.awayScore;
  const actualDiff = match.homeScore - match.awayScore;
  const predictedDiff = prediction.homeScore - prediction.awayScore;
  const correctOutcome =
    outcomeForScore(prediction.homeScore, prediction.awayScore) ===
    outcomeForScore(match.homeScore, match.awayScore);
  const correctGoalDifference = correctOutcome && actualDiff === predictedDiff;

  if (exactScore) {
    return { points: settings.exactScorePoints, exactScore, correctOutcome, correctGoalDifference };
  }
  if (correctGoalDifference) {
    return {
      points: settings.correctGoalDifferencePoints,
      exactScore,
      correctOutcome,
      correctGoalDifference
    };
  }
  if (correctOutcome) {
    return { points: settings.correctOutcomePoints, exactScore, correctOutcome, correctGoalDifference };
  }
  return { points: 0, exactScore, correctOutcome, correctGoalDifference };
}

export function calculatePredictionResult(
  prediction: PredictionScoreInput,
  match: MatchScoreInput,
  settings: ScoreSettings = defaultScoreSettings
) {
  return calculateExactScoreResult(prediction, match, settings);
}

export function calculatePredictionPoints(
  prediction: PredictionScoreInput,
  match: MatchScoreInput,
  settings: ScoreSettings = defaultScoreSettings
) {
  return calculateExactScoreResult(prediction, match, settings).points;
}

export type RankedTeam = {
  teamId: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
};

export function calculateGroupTablePoints(
  predictedTeamIds: string[],
  actualRankedTeamIds: string[],
  advancing:
    | number
    | {
        actualAdvancingTeamIds: string[];
        directAdvancersPerGroup?: number;
        predictedThirdPlaceAdvances?: boolean;
      },
  settings: ScoreSettings = defaultScoreSettings
) {
  const actualAdvancing =
    typeof advancing === "number"
      ? new Set(actualRankedTeamIds.slice(0, advancing))
      : new Set(advancing.actualAdvancingTeamIds);
  const predictedAdvancing =
    typeof advancing === "number"
      ? new Set(predictedTeamIds.slice(0, advancing))
      : new Set([
          ...predictedTeamIds.slice(0, advancing.directAdvancersPerGroup ?? 2),
          ...(advancing.predictedThirdPlaceAdvances &&
          predictedTeamIds[advancing.directAdvancersPerGroup ?? 2]
            ? [predictedTeamIds[advancing.directAdvancersPerGroup ?? 2]]
            : [])
        ]);

  return predictedTeamIds.reduce((sum, teamId, index) => {
    const actualIndex = actualRankedTeamIds.indexOf(teamId);
    if (actualIndex === -1) return sum;

    let points = actualIndex === index ? settings.tableExactPositionPoints : 0;
    const predictedStatus = predictedAdvancing.has(teamId);
    const actualStatus = actualAdvancing.has(teamId);
    if (predictedStatus === actualStatus) points += settings.tableAdvancingStatusPoints;
    if (index === 0 && actualIndex === 0) points += settings.tableGroupWinnerBonus;
    return sum + points;
  }, 0);
}

export function knockoutPointsForRound(
  roundKey: RoundKey,
  settings: ScoreSettings = defaultScoreSettings
) {
  switch (roundKey) {
    case "round_of_32":
      return settings.knockoutRoundOf32Points;
    case "round_of_16":
      return settings.knockoutRoundOf16Points;
    case "quarter_final":
      return settings.knockoutQuarterFinalPoints;
    case "semi_final":
      return settings.knockoutSemiFinalPoints;
    case "final":
      return settings.knockoutChampionPoints;
    case "third_place":
      return settings.knockoutThirdPlacePoints;
    default:
      return 0;
  }
}

export function scoreSettingsFromRow(row: (Partial<ScoreSettings> & Record<string, unknown>) | null | undefined) {
  if (!row) return defaultScoreSettings;
  const numberOrDefault = (value: unknown, fallback: number) =>
    typeof value === "number" ? value : fallback;
  return {
    tableExactPositionPoints: numberOrDefault(
      row.tableExactPositionPoints ?? row.table_exact_position_points,
      defaultScoreSettings.tableExactPositionPoints
    ),
    tableAdvancingStatusPoints: numberOrDefault(
      row.tableAdvancingStatusPoints ?? row.table_advancing_status_points,
      defaultScoreSettings.tableAdvancingStatusPoints
    ),
    tableGroupWinnerBonus: numberOrDefault(
      row.tableGroupWinnerBonus ?? row.table_group_winner_bonus,
      defaultScoreSettings.tableGroupWinnerBonus
    ),
    matchOutcomePoints: numberOrDefault(
      row.matchOutcomePoints ?? row.match_outcome_points,
      defaultScoreSettings.matchOutcomePoints
    ),
    exactScorePoints: numberOrDefault(
      row.exactScorePoints ?? row.exact_score_points,
      defaultScoreSettings.exactScorePoints
    ),
    correctGoalDifferencePoints: numberOrDefault(
      row.correctGoalDifferencePoints ?? row.correct_goal_difference_points,
      defaultScoreSettings.correctGoalDifferencePoints
    ),
    correctOutcomePoints: numberOrDefault(
      row.correctOutcomePoints ?? row.correct_outcome_points,
      defaultScoreSettings.correctOutcomePoints
    ),
    knockoutRoundOf32Points: numberOrDefault(
      row.knockoutRoundOf32Points ?? row.knockout_round_of_32_points,
      defaultScoreSettings.knockoutRoundOf32Points
    ),
    knockoutRoundOf16Points: numberOrDefault(
      row.knockoutRoundOf16Points ?? row.knockout_round_of_16_points,
      defaultScoreSettings.knockoutRoundOf16Points
    ),
    knockoutQuarterFinalPoints: numberOrDefault(
      row.knockoutQuarterFinalPoints ?? row.knockout_quarter_final_points,
      defaultScoreSettings.knockoutQuarterFinalPoints
    ),
    knockoutSemiFinalPoints: numberOrDefault(
      row.knockoutSemiFinalPoints ?? row.knockout_semi_final_points,
      defaultScoreSettings.knockoutSemiFinalPoints
    ),
    knockoutChampionPoints: numberOrDefault(
      row.knockoutChampionPoints ?? row.knockout_champion_points,
      defaultScoreSettings.knockoutChampionPoints
    ),
    knockoutThirdPlacePoints: numberOrDefault(
      row.knockoutThirdPlacePoints ?? row.knockout_third_place_points,
      defaultScoreSettings.knockoutThirdPlacePoints
    )
  };
}
