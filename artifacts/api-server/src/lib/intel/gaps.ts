/**
 * Gap analysis and build briefs.
 *
 * A gap is only ever as strong as the evidence behind it, so every gap
 * carries a claim kind and the findings that support it. The engine is
 * required to say what it does not know: the `evidenceGaps` list names the
 * questions a team still needs to answer, and the brief keeps a section for
 * open questions rather than pretending they are settled.
 */
import { normaliseClaimKind, type ClaimKind } from "./claims.ts";
import type {
  ExtractedRequirement,
  CompetitionBrief,
} from "./problem-analysis.ts";
import type { IdeaCandidate } from "./ideas.ts";

export interface GapInput {
  /** Findings the gap draws on. */
  findings: Array<{
    id: string;
    title: string;
    url: string | null;
    claimKind: ClaimKind;
    supports: string;
  }>;
  /** Requirements the gap addresses. */
  requirements: ExtractedRequirement[];
  /** The competition brief, for scoping. */
  brief: CompetitionBrief;
}

export interface Gap {
  /** The unmet need. */
  need: string;
  /** Who has this need. */
  targetUser: string;
  /** Findings that support the gap. */
  supportingFindingIds: string[];
  /** What already exists in this space. */
  existingApproaches: string;
  /** Why the existing approaches may not be enough. */
  insufficiency: string;
  /** The product opportunity this suggests. */
  opportunity: string;
  /** Risks and open questions. */
  risks: string[];
  /** How well supported this gap is. */
  claimKind: ClaimKind;
}

export interface GapAnalysis {
  gaps: Gap[];
  /** Where the evidence runs out. */
  evidenceGaps: string[];
  /** What to investigate next. */
  nextInvestigations: string[];
  method: "DETERMINISTIC" | "AI_ASSISTED";
  provider?: string;
  model?: string;
}

/**
 * Build a deterministic gap analysis from the research findings.
 *
 * This is a conservative first pass. It reports what the retrieved sources
 * actually say and explicitly states where the evidence stops, rather than
 * asserting that a gap exists because nobody was found.
 */
export function buildDeterministicGaps(input: GapInput): GapAnalysis {
  const { findings, requirements, brief } = input;

  const gaps: Gap[] = [];
  const evidenceGaps: string[] = [];
  const nextInvestigations: string[] = [];

  const problemRequirement = requirements.find(
    (requirement) => requirement.category === "CORE_PROBLEM",
  );
  const targetRequirement = requirements.find(
    (requirement) => requirement.category === "TARGET_USERS",
  );

  if (findings.length === 0) {
    return {
      gaps: [],
      evidenceGaps: [
        "No research sources were retrieved, so no gap can be supported by evidence yet.",
      ],
      nextInvestigations: [
        "Run a research search for the problem area before drawing conclusions about what is missing.",
        "Collect the official rules and judging criteria, which are not recorded for this competition.",
      ],
      method: "DETERMINISTIC",
    };
  }

  for (const finding of findings) {
    gaps.push({
      need:
        problemRequirement?.text ??
        "The problem area described by the retrieved sources.",
      targetUser:
        targetRequirement?.text ?? "The users the retrieved sources describe.",
      supportingFindingIds: [finding.id],
      existingApproaches: finding.title,
      insufficiency:
        "Whether this existing approach is insufficient has not been established. The retrieved source describes the approach but does not compare it against the recorded requirements.",
      opportunity: `A possible opening around ${finding.title}, to be confirmed against the official rules.`,
      risks: [
        "The retrieved source may not be representative of the space.",
        "The competition's judging criteria are not recorded, so alignment cannot be judged yet.",
      ],
      claimKind: finding.claimKind,
    });
  }

  evidenceGaps.push(
    `${findings.length} source${findings.length === 1 ? " was" : "s were"} retrieved, but no source was compared against the recorded requirements.`,
  );
  evidenceGaps.push(
    "No competitor analysis was performed, so no claim is made about which competitors exist.",
  );
  if (!brief.problemStatement) {
    evidenceGaps.push(
      "The competition has no recorded problem statement, so the gaps below are not yet tied to a specific problem.",
    );
  }

  nextInvestigations.push(
    "Read the official rules and judging criteria and record them on the competition.",
    "Open each retrieved source and confirm it still says what the summary says.",
    "Search specifically for the two or three approaches closest to your idea and note what each does not do.",
  );

  return { gaps, evidenceGaps, nextInvestigations, method: "DETERMINISTIC" };
}

/**
 * Merge model-proposed gaps into the deterministic ones.
 *
 * A model may not promote a gap to VERIFIED_FACT, and a gap it proposes
 * without any supporting finding is downgraded to a hypothesis, because an
 * unsupported gap is exactly the kind of claim this product refuses to make.
 */
export function mergeAiGaps(deterministic: Gap[], modelGaps: unknown): Gap[] {
  if (!Array.isArray(modelGaps)) return deterministic;

  const merged = [...deterministic];
  const seenNeeds = new Set(deterministic.map((gap) => gap.need.toLowerCase()));

  for (const raw of modelGaps) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;

    const need = typeof record.need === "string" ? record.need.trim() : "";
    if (!need) continue;
    if (seenNeeds.has(need.toLowerCase())) continue;
    seenNeeds.add(need.toLowerCase());

    const supportingFindingIds = Array.isArray(record.supportingFindingIds)
      ? record.supportingFindingIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];

    const claimKind = normaliseClaimKind(record.claimKind);
    const safeKind: ClaimKind =
      supportingFindingIds.length === 0
        ? "HYPOTHESIS"
        : claimKind === "VERIFIED_FACT"
          ? "SOURCE_SUPPORTED"
          : claimKind;

    merged.push({
      need,
      targetUser:
        typeof record.targetUser === "string" ? record.targetUser.trim() : "",
      supportingFindingIds,
      existingApproaches:
        typeof record.existingApproaches === "string"
          ? record.existingApproaches.trim()
          : "",
      insufficiency:
        typeof record.insufficiency === "string"
          ? record.insufficiency.trim()
          : "",
      opportunity:
        typeof record.opportunity === "string" ? record.opportunity.trim() : "",
      risks: Array.isArray(record.risks)
        ? record.risks.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      claimKind: safeKind,
    });
  }

  return merged;
}

export interface BuildBrief {
  problemStatement: string;
  targetUsers: string;
  valueProposition: string;
  judgingCriteriaAlignment: string;
  mvpScope: string[];
  nonGoals: string[];
  primaryUserJourney: string;
  featureAcceptanceCriteria: string[];
  architectureSuggestion: string;
  dataModelOutline: string;
  securityRequirements: string[];
  testingPlan: string[];
  deploymentPlan: string;
  demoScriptOutline: string[];
  keyRisks: string[];
  openQuestions: string[];
  milestones: string[];
  /** The idea this brief was built from. */
  ideaName: string;
  /** How well supported the brief's claims are. */
  claimKind: ClaimKind;
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : [];

/**
 * Parse a model-proposed build brief into the structured shape.
 *
 * A brief that omits sections is still usable, but the missing sections are
 * reported so the UI can show them as gaps rather than silently blank areas.
 */
export function parseModelBuildBrief(
  raw: unknown,
  idea: IdeaCandidate,
): { brief: BuildBrief; missingSections: string[] } {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const brief: BuildBrief = {
    problemStatement:
      typeof record.problemStatement === "string"
        ? record.problemStatement.trim()
        : idea.problemSolved,
    targetUsers:
      typeof record.targetUsers === "string"
        ? record.targetUsers.trim()
        : idea.targetUser,
    valueProposition:
      typeof record.valueProposition === "string"
        ? record.valueProposition.trim()
        : idea.pitch,
    judgingCriteriaAlignment:
      typeof record.judgingCriteriaAlignment === "string"
        ? record.judgingCriteriaAlignment.trim()
        : "",
    mvpScope:
      stringList(record.mvpScope).length > 0
        ? stringList(record.mvpScope)
        : idea.mvpFeatures,
    nonGoals:
      stringList(record.nonGoals).length > 0
        ? stringList(record.nonGoals)
        : idea.excludedFeatures,
    primaryUserJourney:
      typeof record.primaryUserJourney === "string"
        ? record.primaryUserJourney.trim()
        : idea.coreUserJourney,
    featureAcceptanceCriteria: stringList(record.featureAcceptanceCriteria),
    architectureSuggestion:
      typeof record.architectureSuggestion === "string"
        ? record.architectureSuggestion.trim()
        : idea.architectureSuggestion,
    dataModelOutline:
      typeof record.dataModelOutline === "string"
        ? record.dataModelOutline.trim()
        : "",
    securityRequirements: stringList(record.securityRequirements),
    testingPlan: stringList(record.testingPlan),
    deploymentPlan:
      typeof record.deploymentPlan === "string"
        ? record.deploymentPlan.trim()
        : "",
    demoScriptOutline:
      stringList(record.demoScriptOutline).length > 0
        ? stringList(record.demoScriptOutline)
        : idea.demoStrategy
          ? [idea.demoStrategy]
          : [],
    keyRisks:
      stringList(record.keyRisks).length > 0
        ? stringList(record.keyRisks)
        : idea.risks,
    openQuestions:
      stringList(record.openQuestions).length > 0
        ? stringList(record.openQuestions)
        : idea.unverifiedAssumptions,
    milestones: stringList(record.milestones),
    ideaName: idea.name,
    claimKind: idea.claimKind,
  };

  const missingSections: string[] = [];
  if (!brief.judgingCriteriaAlignment)
    missingSections.push("Judging-criteria alignment");
  if (!brief.dataModelOutline) missingSections.push("Data model outline");
  if (brief.securityRequirements.length === 0)
    missingSections.push("Security requirements");
  if (brief.testingPlan.length === 0) missingSections.push("Testing plan");
  if (!brief.deploymentPlan) missingSections.push("Deployment plan");
  if (brief.milestones.length === 0) missingSections.push("Milestones");

  return { brief, missingSections };
}

/** Build a build brief from an idea alone, with no model involved. */
export function buildBriefFromIdea(idea: IdeaCandidate): {
  brief: BuildBrief;
  missingSections: string[];
} {
  return parseModelBuildBrief({}, idea);
}

/** Prompt for a build brief, grounded in the competition and the idea. */
export function buildBriefPrompt(
  brief: CompetitionBrief,
  idea: IdeaCandidate,
  requirements: ExtractedRequirement[],
): { system: string; user: string } {
  const system = [
    "You write a build brief for a hackathon team.",
    "Answer with a single JSON object and nothing else.",
    "Base every statement on the brief and requirements below. Do not invent judging criteria, prizes, competitors, or deadlines.",
    "If a section cannot be filled from the information given, return an empty array or empty string for it rather than guessing.",
    'Response shape: {"problemStatement":"","targetUsers":"","valueProposition":"","judgingCriteriaAlignment":"","mvpScope":[],"nonGoals":[],"primaryUserJourney":"","featureAcceptanceCriteria":[],"architectureSuggestion":"","dataModelOutline":"","securityRequirements":[],"testingPlan":[],"deploymentPlan":"","demoScriptOutline":[],"keyRisks":[],"openQuestions":[],"milestones":[]}',
  ].join(" ");

  const user = [
    "Competition:",
    `Name: ${brief.name}`,
    `Deadline: ${new Date(brief.deadline).toISOString()}`,
    `Team size: ${brief.teamSize}`,
    `Recorded team skills: ${brief.teamSkills.join(", ") || "not recorded"}`,
    `Recorded mandatory deliverables: ${brief.mandatoryDeliverables.join("; ") || "not recorded"}`,
    "",
    "Requirements already established:",
    ...requirements.map(
      (requirement) =>
        `- [${requirement.claimKind}] (${requirement.category}) ${requirement.text}`,
    ),
    "",
    "Selected idea:",
    `Name: ${idea.name}`,
    `Pitch: ${idea.pitch}`,
    `Target user: ${idea.targetUser}`,
    `MVP features: ${idea.mvpFeatures.join("; ") || "not recorded"}`,
    `Explicitly excluded from MVP: ${idea.excludedFeatures.join("; ") || "not recorded"}`,
    "",
    "Write the build brief. Leave a section empty if the information is not available.",
  ].join("\n");

  return { system, user };
}
