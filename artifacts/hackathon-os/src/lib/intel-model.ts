/**
 * Client-side labels for the intelligence engine.
 *
 * The server decides what is true. This module only supplies wording, so the
 * interface never re-derives a claim kind or a score.
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
  UNKNOWN: "The information is missing. Nothing has been assumed in its place.",
};

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

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> =
  {
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
  DEMONSTRABILITY: "How convincingly the result can be shown in a short demo.",
  IMPLEMENTATION_TIME:
    "How much of the remaining time the idea consumes. Higher is better.",
  RELIABILITY_RISK:
    "How likely the idea is to break or misbehave. Higher is better.",
  DATA_AVAILABILITY:
    "How easily the needed data can be obtained. Higher is better.",
  POTENTIAL_IMPACT: "How much difference the idea could make if it worked.",
};

export const RESEARCH_PROVIDER_LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  arxiv: "arXiv",
  github: "GitHub",
  manual: "Recorded by you",
};

export const RESEARCH_SOURCE_TYPE_LABELS: Record<string, string> = {
  EXISTING_PRODUCT: "Existing product",
  OPEN_SOURCE_REPOSITORY: "Open-source repository",
  TECHNICAL_APPROACH: "Technical approach",
  PUBLISHED_RESEARCH: "Published research",
  COMPETITOR: "Competitor",
  SIMILAR_PROJECT: "Similar project",
  KNOWN_LIMITATION: "Known limitation",
  DIFFERENTIATION_OPPORTUNITY: "Differentiation opportunity",
};

export const BUILD_BRIEF_SECTIONS: Array<{
  key: string;
  label: string;
  kind: "text" | "list";
}> = [
  { key: "problemStatement", label: "Problem statement", kind: "text" },
  { key: "targetUsers", label: "Target users", kind: "text" },
  { key: "valueProposition", label: "Core value proposition", kind: "text" },
  {
    key: "judgingCriteriaAlignment",
    label: "Judging criteria and how the product addresses them",
    kind: "text",
  },
  { key: "mvpScope", label: "MVP scope", kind: "list" },
  { key: "nonGoals", label: "Explicit non-goals", kind: "list" },
  { key: "primaryUserJourney", label: "Primary user journey", kind: "text" },
  {
    key: "featureAcceptanceCriteria",
    label: "Feature acceptance criteria",
    kind: "list",
  },
  {
    key: "architectureSuggestion",
    label: "Suggested architecture",
    kind: "text",
  },
  { key: "dataModelOutline", label: "Data model outline", kind: "text" },
  { key: "securityRequirements", label: "Security requirements", kind: "list" },
  { key: "testingPlan", label: "Testing plan", kind: "list" },
  { key: "deploymentPlan", label: "Deployment plan", kind: "text" },
  { key: "demoScriptOutline", label: "Demo script outline", kind: "list" },
  { key: "keyRisks", label: "Key risks", kind: "list" },
  { key: "openQuestions", label: "Open questions", kind: "list" },
  { key: "milestones", label: "Time-budgeted milestones", kind: "list" },
];
