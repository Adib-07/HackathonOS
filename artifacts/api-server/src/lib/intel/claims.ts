/**
 * Claim kinds and evidence labelling.
 *
 * Every artefact the intelligence engine produces carries a claim kind so a
 * reader can always tell how well-supported a statement is. The rule the
 * product depends on is simple: an inference or hypothesis must never be
 * presented as a rule the competition actually states.
 */

/**
 * - VERIFIED_FACT: read directly out of the stored competition record. It is
 *   as true as the database row.
 * - SOURCE_SUPPORTED: backed by a retrieved source that the user can open.
 * - INFERENCE: derived by the model from the competition record or from
 *   findings. Reasonable, but not stated anywhere.
 * - HYPOTHESIS: a guess the team should test.
 * - UNKNOWN: the information is missing and nobody has filled it in.
 */
export const CLAIM_KINDS = [
  "VERIFIED_FACT",
  "SOURCE_SUPPORTED",
  "INFERENCE",
  "HYPOTHESIS",
  "UNKNOWN",
] as const;

export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_KIND_LABELS: Record<ClaimKind, string> = {
  VERIFIED_FACT: "Verified fact",
  SOURCE_SUPPORTED: "Source-supported",
  INFERENCE: "Inference",
  HYPOTHESIS: "Hypothesis",
  UNKNOWN: "Unknown",
};

export const CLAIM_KIND_DESCRIPTIONS: Record<ClaimKind, string> = {
  VERIFIED_FACT:
    "Read directly from the stored competition record. True as long as that record is.",
  SOURCE_SUPPORTED:
    "Backed by a source you can open. The source is recorded with the finding.",
  INFERENCE:
    "Derived from the competition record or the findings. Plausible, but not stated anywhere.",
  HYPOTHESIS: "A guess that still needs to be tested.",
  UNKNOWN:
    "The information is missing. Nothing has been assumed in its place.",
};

/**
 * Claim kinds that are strong enough to be treated as established by a
 * downstream step. Inferences and hypotheses never qualify.
 */
export const ESTABLISHED_CLAIM_KINDS: ClaimKind[] = [
  "VERIFIED_FACT",
  "SOURCE_SUPPORTED",
];

export function isEstablished(kind: ClaimKind): boolean {
  return ESTABLISHED_CLAIM_KINDS.includes(kind);
}

export function isSpeculative(kind: ClaimKind): boolean {
  return !isEstablished(kind);
}

/** Where a requirement or finding came from. */
export const REQUIREMENT_SOURCES = [
  "COMPETITION_BRIEF",
  "USER_INPUT",
  "AI_INFERENCE",
  "UNVERIFIED_ASSUMPTION",
] as const;

export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

export const REQUIREMENT_SOURCE_LABELS: Record<RequirementSource, string> = {
  COMPETITION_BRIEF: "Competition brief",
  USER_INPUT: "Entered by you",
  AI_INFERENCE: "AI inference",
  UNVERIFIED_ASSUMPTION: "Unverified assumption",
};

/**
 * The categories a requirement can fall into. These mirror the fields the
 * competition record actually stores, so an extraction can say which stored
 * value produced it.
 */
export const REQUIREMENT_CATEGORIES = [
  "CORE_PROBLEM",
  "TARGET_USERS",
  "PAIN_POINTS",
  "REQUIRED_OUTCOMES",
  "JUDGING_CRITERIA",
  "MANDATORY_DELIVERABLES",
  "TECHNICAL_CONSTRAINTS",
  "TIME_CONSTRAINTS",
  "TEAM_SKILLS",
  "AVAILABLE_RESOURCES",
  "EXCLUSIONS",
  "UNANSWERED_QUESTIONS",
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  CORE_PROBLEM: "Core problem",
  TARGET_USERS: "Target users",
  PAIN_POINTS: "Existing pain points",
  REQUIRED_OUTCOMES: "Required outcomes",
  JUDGING_CRITERIA: "Judging criteria",
  MANDATORY_DELIVERABLES: "Mandatory deliverables",
  TECHNICAL_CONSTRAINTS: "Technical constraints",
  TIME_CONSTRAINTS: "Time constraints",
  TEAM_SKILLS: "Team skills",
  AVAILABLE_RESOURCES: "Available resources",
  EXCLUSIONS: "Exclusions and prohibited approaches",
  UNANSWERED_QUESTIONS: "Unanswered questions",
};

/** Research source types. Each maps to a provider that can actually return one. */
export const RESEARCH_SOURCE_TYPES = [
  "EXISTING_PRODUCT",
  "OPEN_SOURCE_REPOSITORY",
  "TECHNICAL_APPROACH",
  "PUBLISHED_RESEARCH",
  "COMPETITOR",
  "SIMILAR_PROJECT",
  "KNOWN_LIMITATION",
  "DIFFERENTIATION_OPPORTUNITY",
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export const RESEARCH_SOURCE_TYPE_LABELS: Record<ResearchSourceType, string> = {
  EXISTING_PRODUCT: "Existing product",
  OPEN_SOURCE_REPOSITORY: "Open-source repository",
  TECHNICAL_APPROACH: "Technical approach",
  PUBLISHED_RESEARCH: "Published research",
  COMPETITOR: "Competitor",
  SIMILAR_PROJECT: "Similar project",
  KNOWN_LIMITATION: "Known limitation",
  DIFFERENTIATION_OPPORTUNITY: "Differentiation opportunity",
};

/**
 * Research providers that can actually be queried. Each is a public,
 * documented API. The set is intentionally small.
 */
export const RESEARCH_PROVIDERS = ["wikipedia", "arxiv", "github"] as const;

export type ResearchProviderId = (typeof RESEARCH_PROVIDERS)[number];

export const RESEARCH_PROVIDER_LABELS: Record<ResearchProviderId, string> = {
  wikipedia: "Wikipedia",
  arxiv: "arXiv",
  github: "GitHub",
};

/**
 * How strongly a claim is supported. Ordered from strongest to weakest so a
 * list can be sorted by support.
 */
export const SUPPORT_LEVELS = ["STRONG", "MODERATE", "WEAK", "NONE"] as const;

export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

export const SUPPORT_LEVEL_LABELS: Record<SupportLevel, string> = {
  STRONG: "Strong support",
  MODERATE: "Moderate support",
  WEAK: "Weak support",
  NONE: "No supporting evidence",
};

/** Map a claim kind onto how well supported it is. */
export function supportLevelFor(kind: ClaimKind): SupportLevel {
  switch (kind) {
    case "VERIFIED_FACT":
      return "STRONG";
    case "SOURCE_SUPPORTED":
      return "MODERATE";
    case "INFERENCE":
      return "WEAK";
    default:
      return "NONE";
  }
}

/**
 * Normalise a claim kind coming from a model. Anything unrecognised becomes
 * an inference rather than being trusted, so a malformed model response can
 * never promote a guess into a fact.
 */
export function normaliseClaimKind(value: unknown): ClaimKind {
  if (typeof value !== "string") return "INFERENCE";
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (CLAIM_KINDS as readonly string[]).includes(upper)
    ? (upper as ClaimKind)
    : "INFERENCE";
}

/** Normalise a requirement source coming from a model. */
export function normaliseRequirementSource(value: unknown): RequirementSource {
  if (typeof value !== "string") return "AI_INFERENCE";
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (REQUIREMENT_SOURCES as readonly string[]).includes(upper)
    ? (upper as RequirementSource)
    : "AI_INFERENCE";
}

/** Normalise a requirement category coming from a model. */
export function normaliseRequirementCategory(
  value: unknown,
): RequirementCategory {
  if (typeof value !== "string") return "CORE_PROBLEM";
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (REQUIREMENT_CATEGORIES as readonly string[]).includes(upper)
    ? (upper as RequirementCategory)
    : "CORE_PROBLEM";
}

/** Normalise a research source type coming from a provider or a model. */
export function normaliseResearchSourceType(
  value: unknown,
): ResearchSourceType {
  if (typeof value !== "string") return "TECHNICAL_APPROACH";
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (RESEARCH_SOURCE_TYPES as readonly string[]).includes(upper)
    ? (upper as ResearchSourceType)
    : "TECHNICAL_APPROACH";
}
