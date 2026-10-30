/**
 * Problem statement intelligence.
 *
 * The extraction of competition requirements is deliberately split in two:
 *
 *   1. A deterministic pass that reads the stored competition record and
 *      produces VERIFIED_FACT requirements. These cannot be wrong, because
 *      they are copies of what the database holds. This part needs no AI.
 *   2. An AI pass that may add INFERENCE and HYPOTHESIS requirements, and
 *      may propose JUDGING_CRITERIA and EXCLUSIONS that are not stored.
 *
 * The deterministic pass always runs and always runs first, so the user sees
 * a usable analysis even when no provider is configured. Anything the model
 * adds is labelled as an inference and can be edited or rejected.
 */
import {
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_CATEGORY_LABELS,
  normaliseClaimKind,
  normaliseRequirementCategory,
  normaliseRequirementSource,
  type ClaimKind,
  type RequirementCategory,
  type RequirementSource,
} from "./claims.ts";

/** The subset of the competition record the engine reads. */
export interface CompetitionBrief {
  id: string;
  name: string;
  organizer: string | null;
  competitionType: string;
  deadline: string | Date;
  startAt: string | Date | null;
  teamSize: number;
  teamSkills: string[];
  mandatoryDeliverables: string[];
  currentTrack: string | null;
  trackMode: string;
  problemStatement: string | null;
  officialUrl: string | null;
  rulesUrl: string | null;
  ideaComplexity: number;
  status: string;
}

export interface ExtractedRequirement {
  category: RequirementCategory;
  text: string;
  claimKind: ClaimKind;
  source: RequirementSource;
  /** The stored field this requirement came from, when it came from one. */
  origin?: string;
}

export interface ProblemAnalysis {
  /** A short statement of the core problem, or a note that it is not recorded. */
  coreProblem: string;
  requirements: ExtractedRequirement[];
  /** Fields the competition record does not contain. */
  missingFields: string[];
  /** Questions the team still needs to answer. */
  unansweredQuestions: string[];
  /** How the analysis was produced. */
  method: "DETERMINISTIC" | "AI_ASSISTED" | "AI_ONLY";
  /** Which provider produced the AI portion, when there was one. */
  provider?: string;
  model?: string;
}

function addRequirement(
  list: ExtractedRequirement[],
  requirement: ExtractedRequirement,
): void {
  const text = requirement.text.trim();
  if (!text) return;
  list.push({ ...requirement, text });
}

/**
 * Read the stored competition record and produce verified requirements.
 *
 * Nothing is inferred here. A field the record does not contain produces a
 * missing-field entry, never a guess.
 */
export function extractDeterministicRequirements(brief: CompetitionBrief): {
  requirements: ExtractedRequirement[];
  missingFields: string[];
  unansweredQuestions: string[];
  coreProblem: string;
} {
  const requirements: ExtractedRequirement[] = [];
  const missingFields: string[] = [];
  const unansweredQuestions: string[] = [];

  // Core problem.
  if (brief.problemStatement?.trim()) {
    addRequirement(requirements, {
      category: "CORE_PROBLEM",
      text: brief.problemStatement.trim(),
      claimKind: "VERIFIED_FACT",
      source: "COMPETITION_BRIEF",
      origin: "problemStatement",
    });
  } else {
    missingFields.push("Problem statement");
    unansweredQuestions.push(
      "What exact problem does this competition ask the team to solve?",
    );
  }

  // Target users. The problem statement may describe them, but free text
  // cannot be read deterministically, so this is an inference the team must
  // confirm rather than a verified fact.
  if (brief.problemStatement?.trim()) {
    addRequirement(requirements, {
      category: "TARGET_USERS",
      text: "The recorded problem statement probably names the target users. Confirm who they are before designing for them.",
      claimKind: "INFERENCE",
      source: "AI_INFERENCE",
      origin: "problemStatement",
    });
  } else {
    missingFields.push("Target users");
    unansweredQuestions.push("Who exactly is the end user for this solution?");
  }

  // Pain points.
  missingFields.push("Existing pain points");
  unansweredQuestions.push(
    "What do the target users do today, and where does that hurt?",
  );

  // Required outcomes.
  missingFields.push("Required outcomes");
  unansweredQuestions.push(
    "What must be true for the entry to count as successful?",
  );

  // Judging criteria.
  missingFields.push("Judging criteria");
  unansweredQuestions.push(
    "How will judges score entries, and which criterion carries the most weight?",
  );

  // Mandatory deliverables.
  if (brief.mandatoryDeliverables.length > 0) {
    for (const deliverable of brief.mandatoryDeliverables) {
      addRequirement(requirements, {
        category: "MANDATORY_DELIVERABLES",
        text: deliverable,
        claimKind: "VERIFIED_FACT",
        source: "COMPETITION_BRIEF",
        origin: "mandatoryDeliverables",
      });
    }
  } else {
    missingFields.push("Mandatory deliverables");
    unansweredQuestions.push(
      "What must be submitted for the entry to be accepted?",
    );
  }

  // Technical constraints.
  if (brief.competitionType && brief.competitionType !== "unknown") {
    addRequirement(requirements, {
      category: "TECHNICAL_CONSTRAINTS",
      text: `Format is ${brief.competitionType.replaceAll("_", " ")}.`,
      claimKind: "VERIFIED_FACT",
      source: "COMPETITION_BRIEF",
      origin: "competitionType",
    });
  }

  // Time constraints. The deadline is the stored fact. The remaining time is
  // computed at analysis time and is labelled as such, because it goes stale.
  const deadline = new Date(brief.deadline);
  const now = new Date();
  const hoursRemaining = Math.floor(
    (deadline.getTime() - now.getTime()) / 3_600_000,
  );
  addRequirement(requirements, {
    category: "TIME_CONSTRAINTS",
    text: `Submission deadline is ${deadline.toISOString()}. At the time of this analysis that was about ${hoursRemaining} hours away.`,
    claimKind: "VERIFIED_FACT",
    source: "COMPETITION_BRIEF",
    origin: "deadline",
  });

  if (hoursRemaining <= 0) {
    unansweredQuestions.push(
      "The recorded deadline has already passed. Which deadline is the real one?",
    );
  }

  // Team skills.
  if (brief.teamSkills.length > 0) {
    for (const skill of brief.teamSkills) {
      addRequirement(requirements, {
        category: "TEAM_SKILLS",
        text: skill,
        claimKind: "VERIFIED_FACT",
        source: "COMPETITION_BRIEF",
        origin: "teamSkills",
      });
    }
  } else {
    missingFields.push("Team skills");
    unansweredQuestions.push(
      "What can the team actually build with, given its skills?",
    );
  }

  // Available resources.
  addRequirement(requirements, {
    category: "AVAILABLE_RESOURCES",
    text: `The team has ${brief.teamSize} ${brief.teamSize === 1 ? "builder" : "builders"} available.`,
    claimKind: "VERIFIED_FACT",
    source: "COMPETITION_BRIEF",
    origin: "teamSize",
  });

  if (brief.currentTrack?.trim()) {
    addRequirement(requirements, {
      category: "TECHNICAL_CONSTRAINTS",
      text: `The selected track is ${brief.currentTrack.trim()}. The entry is judged against that track.`,
      claimKind: "VERIFIED_FACT",
      source: "COMPETITION_BRIEF",
      origin: "currentTrack",
    });
  }

  // Exclusions.
  missingFields.push("Exclusions and prohibited approaches");
  unansweredQuestions.push(
    "Which approaches or technologies are explicitly ruled out?",
  );

  const coreProblem = brief.problemStatement?.trim()
    ? brief.problemStatement.trim()
    : "No problem statement is recorded for this competition yet.";

  return { requirements, missingFields, unansweredQuestions, coreProblem };
}

/**
 * Merge model-proposed requirements into the deterministic ones.
 *
 * Model output is never trusted to describe a rule as verified. A model may
 * only add INFERENCE or HYPOTHESIS requirements, and any requirement that
 * repeats an existing one is dropped.
 */
export function mergeAiRequirements(
  deterministic: ExtractedRequirement[],
  modelRequirements: unknown,
): ExtractedRequirement[] {
  if (!Array.isArray(modelRequirements)) return deterministic;

  const seen = new Set(
    deterministic.map((item) => item.text.toLowerCase().trim()),
  );
  const merged = [...deterministic];

  for (const raw of modelRequirements) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // A model may never promote its own output to a verified fact.
    const claimKind = normaliseClaimKind(record.claimKind);
    const safeKind: ClaimKind =
      claimKind === "VERIFIED_FACT" ? "INFERENCE" : claimKind;

    merged.push({
      category: normaliseRequirementCategory(record.category),
      text,
      claimKind: safeKind,
      source: normaliseRequirementSource(record.source),
    });
  }

  return merged;
}

/** Group requirements by category for display. */
export function groupRequirements(
  requirements: ExtractedRequirement[],
): Array<{
  category: RequirementCategory;
  label: string;
  items: ExtractedRequirement[];
}> {
  const groups = new Map<RequirementCategory, ExtractedRequirement[]>();
  for (const requirement of requirements) {
    const list = groups.get(requirement.category) ?? [];
    list.push(requirement);
    groups.set(requirement.category, list);
  }

  return REQUIREMENT_CATEGORIES.filter((category) => groups.has(category)).map(
    (category) => ({
      category,
      label: REQUIREMENT_CATEGORY_LABELS[category],
      items: groups.get(category) ?? [],
    }),
  );
}

/**
 * The prompt used to ask a model for the parts of the analysis the
 * deterministic pass cannot produce.
 */
export function buildAnalysisPrompt(brief: CompetitionBrief): {
  system: string;
  user: string;
} {
  const system = [
    "You help a hackathon team understand a competition before they build.",
    "Answer with a single JSON object and nothing else.",
    "You may only add requirements that are NOT already recorded in the brief.",
    "Anything you infer must use claimKind INFERENCE or HYPOTHESIS.",
    "Never state a rule as VERIFIED_FACT unless it is quoted from the brief.",
    "Do not invent competitors, budgets, prizes, judging criteria or deadlines.",
    'Response shape: {"requirements":[{"category":"...","text":"...","claimKind":"INFERENCE|HYPOTHESIS","source":"AI_INFERENCE|UNVERIFIED_ASSUMPTION"}],"unansweredQuestions":["..."]}',
  ].join(" ");

  const user = [
    "Competition brief:",
    `Name: ${brief.name}`,
    `Organizer: ${brief.organizer ?? "not recorded"}`,
    `Format: ${brief.competitionType}`,
    `Deadline: ${new Date(brief.deadline).toISOString()}`,
    `Track: ${brief.currentTrack ?? "not recorded"} (${brief.trackMode})`,
    `Team size: ${brief.teamSize}`,
    `Recorded team skills: ${brief.teamSkills.length > 0 ? brief.teamSkills.join(", ") : "not recorded"}`,
    `Recorded mandatory deliverables: ${brief.mandatoryDeliverables.length > 0 ? brief.mandatoryDeliverables.join("; ") : "not recorded"}`,
    `Problem statement: ${brief.problemStatement ?? "not recorded"}`,
    "",
    "List additional requirements the team should consider, and the questions they still need answered.",
  ].join("\n");

  return { system, user };
}
