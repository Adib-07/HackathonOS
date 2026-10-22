/**
 * Idea generation and evaluation.
 *
 * The scoring engine is deliberately transparent and deterministic: the
 * weights, the per-dimension scores, and the arithmetic are all visible, and
 * the totals are reproducible from the inputs. Scores are a structured
 * opinion to help a team compare options, never a prediction of a win.
 */
import {
  normaliseClaimKind,
  type ClaimKind,
} from "./claims.ts";

/** The dimensions a team can score an idea on. */
export const IDEA_DIMENSIONS = [
  "PROBLEM_RELEVANCE",
  "JUDGING_ALIGNMENT",
  "USER_VALUE",
  "DIFFERENTIATION",
  "TECHNICAL_FEASIBILITY",
  "DEMONSTRABILITY",
  "IMPLEMENTATION_TIME",
  "RELIABILITY_RISK",
  "DATA_AVAILABILITY",
  "POTENTIAL_IMPACT",
] as const;

export type IdeaDimension = (typeof IDEA_DIMENSIONS)[number];

export const IDEA_DIMENSION_LABELS: Record<IdeaDimension, string> = {
  PROBLEM_RELEVANCE: "Problem relevance",
  JUDGING_ALIGNMENT: "Judging-criteria alignment",
  USER_VALUE: "User value",
  DIFFERENTIATION: "Differentiation",
  TECHNICAL_FEASIBILITY: "Technical feasibility",
  DEMONSTRABILITY: "Demonstrability",
  IMPLEMENTATION_TIME: "Implementation time",
  RELIABILITY_RISK: "Reliability risk",
  DATA_AVAILABILITY: "Data availability",
  POTENTIAL_IMPACT: "Potential impact",
};

export const IDEA_DIMENSION_HINTS: Record<IdeaDimension, string> = {
  PROBLEM_RELEVANCE:
    "How directly the idea addresses the problem the competition asks about.",
  JUDGING_ALIGNMENT:
    "How well the idea would score against the competition's judging criteria.",
  USER_VALUE: "How much real value the target user would get.",
  DIFFERENTIATION:
    "How clearly this differs from the approaches research already found.",
  TECHNICAL_FEASIBILITY:
    "How likely the team is to build it with the skills and time available.",
  DEMONSTRABILITY:
    "How convincingly the result can be shown in a short demo.",
  IMPLEMENTATION_TIME:
    "How much of the remaining time the idea consumes. Higher is better.",
  RELIABILITY_RISK: "How likely the idea is to break or misbehave. Higher is better.",
  DATA_AVAILABILITY: "How easily the needed data can be obtained. Higher is better.",
  POTENTIAL_IMPACT: "How much difference the idea could make if it worked.",
};

/**
 * Default weights. They are a starting point, not a truth. `JUDGING_ALIGNMENT`
 * and `PROBLEM_RELEVANCE` are weighted highest because a competition entry is
 * judged, not shipped.
 */
export const DEFAULT_IDEA_WEIGHTS: Record<IdeaDimension, number> = {
  PROBLEM_RELEVANCE: 0.15,
  JUDGING_ALIGNMENT: 0.15,
  USER_VALUE: 0.12,
  DIFFERENTIATION: 0.1,
  TECHNICAL_FEASIBILITY: 0.13,
  DEMONSTRABILITY: 0.1,
  IMPLEMENTATION_TIME: 0.08,
  RELIABILITY_RISK: 0.05,
  DATA_AVAILABILITY: 0.05,
  POTENTIAL_IMPACT: 0.07,
};

/** The score range used for every dimension. */
export const IDEA_SCORE_MIN = 1;
export const IDEA_SCORE_MAX = 5;

export interface DimensionScore {
  dimension: IdeaDimension;
  /** 1 (worst) to 5 (best). */
  score: number;
  /** Why this score was given. */
  rationale: string;
  /** Evidence ids or references that support the score. */
  evidenceRefs: string[];
  /** What the team does not know yet. */
  uncertainties: string[];
  /** How confident the score is. */
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface IdeaEvaluation {
  ideaId: string;
  scores: DimensionScore[];
  /** The weighted total, 0-100. */
  total: number;
  /** The lowest and highest total the idea could reach if its weakest assumptions moved. */
  sensitivityRange: { min: number; max: number };
  /** Which dimensions drive the total. */
  strongestDimensions: IdeaDimension[];
  weakestDimensions: IdeaDimension[];
  /** Dimensions where the team admitted uncertainty. */
  uncertainDimensions: IdeaDimension[];
}

export interface IdeaCandidate {
  id?: string;
  name: string;
  pitch: string;
  targetUser: string;
  problemSolved: string;
  proposedSolution: string;
  differentiator: string;
  coreUserJourney: string;
  mvpFeatures: string[];
  excludedFeatures: string[];
  architectureSuggestion: string;
  dataAndIntegrations: string;
  feasibilityNote: string;
  risks: string[];
  demoStrategy: string;
  supportingEvidence: string[];
  unverifiedAssumptions: string[];
  /** How well supported the idea itself is. */
  claimKind: ClaimKind;
}

export interface ScoreWeights {
  weights: Record<IdeaDimension, number>;
}

/**
 * Normalise weights so they sum to 1.
 *
 * If every weight is zero the defaults are used, because a zero-weight
 * rubric would make every idea score identically and hide the real
 * differences.
 */
export function normaliseWeights(
  input: Partial<Record<IdeaDimension, number>> | undefined,
): Record<IdeaDimension, number> {
  const source: Partial<Record<IdeaDimension, number>> = {
    ...DEFAULT_IDEA_WEIGHTS,
    ...(input ?? {}),
  };

  const cleaned = {} as Record<IdeaDimension, number>;
  for (const dimension of IDEA_DIMENSIONS) {
    const value = Number(source[dimension]);
    // An unusable weight falls back to the default for that dimension rather
    // than dropping the dimension from the rubric entirely.
    cleaned[dimension] =
      Number.isFinite(value) && value > 0 ? value : DEFAULT_IDEA_WEIGHTS[dimension];
  }

  const total = IDEA_DIMENSIONS.reduce((sum, dimension) => sum + cleaned[dimension], 0);
  if (total <= 0) return { ...DEFAULT_IDEA_WEIGHTS };

  const normalised = {} as Record<IdeaDimension, number>;
  for (const dimension of IDEA_DIMENSIONS) {
    normalised[dimension] = cleaned[dimension] / total;
  }
  return normalised;
}

/** Clamp a score into the allowed range. */
export function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return IDEA_SCORE_MIN;
  return Math.min(IDEA_SCORE_MAX, Math.max(IDEA_SCORE_MIN, score));
}

/**
 * Compute a weighted total, expressed 0-100.
 *
 * The weighted mean of the 1-5 scores is rescaled so the result is
 * comparable and intuitive: 1 across the board is 0, 5 across the board
 * is 100.
 */
export function computeWeightedTotal(
  scores: DimensionScore[],
  weights: Record<IdeaDimension, number>,
): number {
  if (scores.length === 0) return 0;

  const weightFor = (dimension: IdeaDimension) =>
    weights[dimension] ?? DEFAULT_IDEA_WEIGHTS[dimension];

  let weighted = 0;
  let weightUsed = 0;
  for (const score of scores) {
    const weight = weightFor(score.dimension);
    weighted += clampScore(score.score) * weight;
    weightUsed += weight;
  }

  if (weightUsed <= 0) return 0;

  const mean = weighted / weightUsed;
  const scaled = ((mean - IDEA_SCORE_MIN) / (IDEA_SCORE_MAX - IDEA_SCORE_MIN)) * 100;
  return Math.round(scaled * 10) / 10;
}

/**
 * Sensitivity: how far the total could move if each dimension took its best
 * or worst possible value while the others stayed as they are.
 *
 * This makes the fragility of a total visible instead of hiding a weak
 * dimension behind a strong aggregate.
 */
export function computeSensitivity(
  scores: DimensionScore[],
  weights: Record<IdeaDimension, number>,
): { min: number; max: number } {
  if (scores.length === 0) return { min: 0, max: 0 };

  const base = computeWeightedTotal(scores, weights);

  let min = base;
  let max = base;

  for (const score of scores) {
    // Only this dimension moves. Everything else keeps its current score.
    const bestTotal = computeWeightedTotal(
      scores.map((item) =>
        item.dimension === score.dimension ? { ...item, score: IDEA_SCORE_MAX } : item,
      ),
      weights,
    );
    const worstTotal = computeWeightedTotal(
      scores.map((item) =>
        item.dimension === score.dimension ? { ...item, score: IDEA_SCORE_MIN } : item,
      ),
      weights,
    );

    min = Math.min(min, worstTotal);
    max = Math.max(max, bestTotal);
  }

  return { min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10 };
}

/** Rank dimensions by their contribution to the weighted total. */
function rankDimensions(
  scores: DimensionScore[],
  weights: Record<IdeaDimension, number>,
): { strongest: IdeaDimension[]; weakest: IdeaDimension[] } {
  const ranked = scores
    .map((score) => ({
      dimension: score.dimension,
      contribution:
        clampScore(score.score) *
        (weights[score.dimension] ?? DEFAULT_IDEA_WEIGHTS[score.dimension]),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const third = Math.max(1, Math.ceil(ranked.length / 3));

  return {
    strongest: ranked.slice(0, third).map((item) => item.dimension),
    weakest: ranked.slice(-third).map((item) => item.dimension),
  };
}

/** Compute the full evaluation for one idea. */
export function evaluateIdea(
  ideaId: string,
  scores: DimensionScore[],
  weightInput?: Partial<Record<IdeaDimension, number>>,
): IdeaEvaluation {
  const weights = normaliseWeights(weightInput);
  const ranked = rankDimensions(scores, weights);

  return {
    ideaId,
    scores,
    total: computeWeightedTotal(scores, weights),
    sensitivityRange: computeSensitivity(scores, weights),
    strongestDimensions: ranked.strongest,
    weakestDimensions: ranked.weakest,
    uncertainDimensions: scores
      .filter((score) => score.confidence === "LOW" || score.uncertainties.length > 0)
      .map((score) => score.dimension),
  };
}

/**
 * Compare several ideas side by side.
 *
 * The result is sorted by total, but every entry keeps its own dimension
 * scores so the user can see *why* one idea is ahead rather than only that
 * it is.
 */
export interface IdeaComparisonInput {
  ideaId: string;
  name: string;
  evaluation: IdeaEvaluation;
}

export interface IdeaComparison {
  ranked: Array<{
    ideaId: string;
    name: string;
    total: number;
    evaluation: IdeaEvaluation;
  }>;
  /** The dimension with the biggest spread between the best and worst idea. */
  mostDivisiveDimension: IdeaDimension | null;
  /** The dimension where every idea scores similarly. */
  leastDivisiveDimension: IdeaDimension | null;
}

export function compareIdeas(
  ideas: IdeaComparisonInput[],
): IdeaComparison {
  const ranked = [...ideas]
    .sort((a, b) => b.evaluation.total - a.evaluation.total)
    .map((idea) => ({
      ideaId: idea.ideaId,
      name: idea.name,
      total: idea.evaluation.total,
      evaluation: idea.evaluation,
    }));

  if (ranked.length < 2) {
    return {
      ranked,
      mostDivisiveDimension: null,
      leastDivisiveDimension: null,
    };
  }

  const spreads: Array<{ dimension: IdeaDimension; spread: number }> = [];
  for (const dimension of IDEA_DIMENSIONS) {
    const values = ranked
      .map((entry) => entry.evaluation.scores.find((s) => s.dimension === dimension))
      .filter((score): score is DimensionScore => Boolean(score))
      .map((score) => clampScore(score.score));

    if (values.length < 2) continue;
    spreads.push({
      dimension,
      spread: Math.max(...values) - Math.min(...values),
    });
  }

  spreads.sort((a, b) => b.spread - a.spread);

  return {
    ranked,
    mostDivisiveDimension: spreads[0]?.dimension ?? null,
    leastDivisiveDimension: spreads[spreads.length - 1]?.dimension ?? null,
  };
}

/**
 * Parse model-proposed scores into the structured shape.
 *
 * Unparseable scores are dropped rather than defaulted, so a malformed
 * response cannot inflate an idea's total with invented numbers.
 */
export function parseModelScores(
  raw: unknown,
): DimensionScore[] {
  if (!Array.isArray(raw)) return [];

  const scores: DimensionScore[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const dimension = String(record.dimension ?? "").toUpperCase();
    if (!(IDEA_DIMENSIONS as readonly string[]).includes(dimension)) continue;

    const numericScore = Number(record.score);
    if (!Number.isFinite(numericScore)) continue;

    const confidence = String(record.confidence ?? "MEDIUM").toUpperCase();

    scores.push({
      dimension: dimension as IdeaDimension,
      score: clampScore(numericScore),
      rationale:
        typeof record.rationale === "string" && record.rationale.trim()
          ? record.rationale.trim()
          : "No rationale was provided for this score.",
      evidenceRefs: Array.isArray(record.evidenceRefs)
        ? record.evidenceRefs.filter((ref): ref is string => typeof ref === "string")
        : [],
      uncertainties: Array.isArray(record.uncertainties)
        ? record.uncertainties.filter((item): item is string => typeof item === "string")
        : [],
      confidence:
        confidence === "LOW" || confidence === "HIGH" ? confidence : "MEDIUM",
    });
  }

  return scores;
}

/** Parse model-proposed ideas into the structured shape. */
export function parseModelIdeas(raw: unknown): IdeaCandidate[] {
  if (!Array.isArray(raw)) return [];

  const ideas: IdeaCandidate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const name = typeof record.name === "string" ? record.name.trim() : "";
    const pitch = typeof record.pitch === "string" ? record.pitch.trim() : "";
    if (!name || !pitch) continue;

    const stringList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
        : [];

    ideas.push({
      name,
      pitch,
      targetUser:
        typeof record.targetUser === "string" ? record.targetUser.trim() : "",
      problemSolved:
        typeof record.problemSolved === "string" ? record.problemSolved.trim() : "",
      proposedSolution:
        typeof record.proposedSolution === "string"
          ? record.proposedSolution.trim()
          : "",
      differentiator:
        typeof record.differentiator === "string"
          ? record.differentiator.trim()
          : "",
      coreUserJourney:
        typeof record.coreUserJourney === "string"
          ? record.coreUserJourney.trim()
          : "",
      mvpFeatures: stringList(record.mvpFeatures),
      excludedFeatures: stringList(record.excludedFeatures),
      architectureSuggestion:
        typeof record.architectureSuggestion === "string"
          ? record.architectureSuggestion.trim()
          : "",
      dataAndIntegrations:
        typeof record.dataAndIntegrations === "string"
          ? record.dataAndIntegrations.trim()
          : "",
      feasibilityNote:
        typeof record.feasibilityNote === "string" ? record.feasibilityNote.trim() : "",
      risks: stringList(record.risks),
      demoStrategy:
        typeof record.demoStrategy === "string" ? record.demoStrategy.trim() : "",
      supportingEvidence: stringList(record.supportingEvidence),
      unverifiedAssumptions: stringList(record.unverifiedAssumptions),
      // A generated idea is an inference until the team backs it with sources.
      claimKind: normaliseClaimKind(record.claimKind) === "VERIFIED_FACT"
        ? "INFERENCE"
        : normaliseClaimKind(record.claimKind),
    });
  }

  return ideas;
}

/**
 * Remove ideas that are effectively the same as one already kept.
 *
 * Two ideas are treated as the same when they share a distinctive phrase,
 * which catches a model producing three variations of one concept.
 */
export function dedupeIdeas(ideas: IdeaCandidate[]): IdeaCandidate[] {
  const kept: IdeaCandidate[] = [];
  const seenPhrases = new Set<string>();

  for (const idea of ideas) {
    const phrases = new Set(
      `${idea.name} ${idea.pitch}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 4),
    );

    let duplicate = false;
    for (const phrase of phrases) {
      if (seenPhrases.has(phrase)) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) continue;
    for (const phrase of phrases) seenPhrases.add(phrase);
    kept.push(idea);
  }

  return kept;
}
