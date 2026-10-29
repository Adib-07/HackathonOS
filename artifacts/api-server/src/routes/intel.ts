/**
 * The research and idea intelligence API.
 *
 * Every route is scoped to a competition the caller owns. The AI portions
 * fail with a clear, actionable error when no provider is configured, and
 * the deterministic portions always work. Nothing in this file invents a
 * source, a citation, or a finding.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  analysisRequirementsTable,
  buildBriefsTable,
  competitionAnalysesTable,
  competitionsTable,
  db,
  ideaCandidatesTable,
  ideaEvaluationsTable,
  ideaRubricsTable,
  researchFindingsTable,
  researchGapsTable,
} from "@workspace/db";
import {
  CreateAnalysisParams,
  CreateAnalysisResponse,
  CreateBriefParams,
  CreateBriefResponse,
  CreateGapsParams,
  CreateGapsResponse,
  CreateIdeasParams,
  CreateIdeasResponse,
  CreateResearchBody,
  CreateResearchParams,
  CreateResearchResponse,
  DecideIdeaBody,
  DecideIdeaParams,
  DecideIdeaResponse,
  DeleteResearchParams,
  DeleteResearchResponse,
  EvaluateIdeaBody,
  EvaluateIdeaParams,
  EvaluateIdeaResponse,
  GetAnalysisParams,
  GetAnalysisResponse,
  ListBriefsParams,
  ListBriefsResponse,
  ListGapsParams,
  ListGapsResponse,
  ListIdeasParams,
  ListIdeasResponse,
  ListResearchParams,
  ListResearchResponse,
  SaveRubricBody,
  SaveRubricParams,
  SaveRubricResponse,
  UpdateRequirementBody,
  UpdateRequirementParams,
  UpdateRequirementResponse,
} from "@workspace/api-zod";
import {
  CLAIM_KINDS,
  RESEARCH_PROVIDERS,
  normaliseClaimKind,
  normaliseRequirementCategory,
  normaliseResearchSourceType,
  type ClaimKind,
} from "../lib/intel/claims.ts";
import {
  buildAnalysisPrompt,
  extractDeterministicRequirements,
  groupRequirements,
  mergeAiRequirements,
  type CompetitionBrief,
} from "../lib/intel/problem-analysis.ts";
import {
  buildBriefPrompt,
  buildBriefFromIdea,
  buildDeterministicGaps,
  mergeAiGaps,
  parseModelBuildBrief,
  type BuildBrief,
} from "../lib/intel/gaps.ts";
import {
  DEFAULT_IDEA_WEIGHTS,
  IDEA_DIMENSIONS,
  compareIdeas,
  dedupeIdeas,
  evaluateIdea,
  normaliseWeights,
  parseModelIdeas,
  parseModelScores,
  type DimensionScore,
  type IdeaCandidate,
  type IdeaDimension,
} from "../lib/intel/ideas.ts";
import { runResearchSearch } from "../lib/intel/research.ts";
import { createWindowLimiter } from "../lib/intel/rate-limit.ts";
import {
  aiErrorResponse,
  aiNotConfiguredResponse,
  briefFromCompetition,
  currentAiProvider,
  findOwnedCompetition,
} from "../lib/intel/helpers.ts";

const router: IRouter = Router();

/**
 * Rate limits for outbound work.
 *
 * Research searches hit public APIs that rate limit unauthenticated callers,
 * and AI calls cost money, so both are capped. The limiters are per process
 * and in memory: they protect one instance, not a fleet.
 */
const RESEARCH_MAX_PER_MINUTE = 8;
const AI_MAX_PER_MINUTE = 12;

const researchLimiter = createWindowLimiter(RESEARCH_MAX_PER_MINUTE, 60_000);
const aiLimiter = createWindowLimiter(AI_MAX_PER_MINUTE, 60_000);

function researchRateLimited(): boolean {
  return !researchLimiter.allow();
}

function aiRateLimited(): boolean {
  return !aiLimiter.allow();
}

function requireCompetition(
  competitionId: string,
  ownerId: string,
): Promise<Awaited<ReturnType<typeof findOwnedCompetition>>> {
  return findOwnedCompetition(competitionId, ownerId);
}

// --- problem analysis ---------------------------------------------------

router.post(
  "/competitions/:competitionId/analysis",
  async (req, res): Promise<void> => {
    const params = CreateAnalysisParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const brief: CompetitionBrief = briefFromCompetition(competition);
    const deterministic = extractDeterministicRequirements(brief);

    let requirements = deterministic.requirements;
    let method: "DETERMINISTIC" | "AI_ASSISTED" = "DETERMINISTIC";
    let provider: string | undefined;
    let model: string | undefined;
    let unansweredQuestions = deterministic.unansweredQuestions;
    let aiNote: string | null = null;

    const providerInstance = currentAiProvider();
    if (providerInstance) {
      try {
        const prompt = buildAnalysisPrompt(brief);
        const completion = await providerInstance.completeJson({
          ...prompt,
          purpose: "problem analysis",
        });
        requirements = mergeAiRequirements(
          deterministic.requirements,
          completion.data.requirements,
        );
        if (Array.isArray(completion.data.unansweredQuestions)) {
          unansweredQuestions = [
            ...deterministic.unansweredQuestions,
            ...completion.data.unansweredQuestions.filter(
              (item): item is string => typeof item === "string",
            ),
          ];
        }
        method = "AI_ASSISTED";
        provider = completion.provider;
        model = completion.model;
      } catch (error) {
        // The deterministic analysis is still useful, so it is returned with a
        // note explaining what could not be added.
        const failure = aiErrorResponse(error);
        aiNote = failure.body.error;
      }
    } else {
      aiNote =
        "No AI provider is configured, so this analysis contains only what the competition record states. Nothing has been inferred.";
    }

    const [latest] = await db
      .select({ version: competitionAnalysesTable.version })
      .from(competitionAnalysesTable)
      .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
      .orderBy(desc(competitionAnalysesTable.version))
      .limit(1);

    const [analysis] = await db
      .insert(competitionAnalysesTable)
      .values({
        competitionId: params.data.competitionId,
        version: (latest?.version ?? 0) + 1,
        coreProblem: deterministic.coreProblem,
        missingFields: deterministic.missingFields,
        unansweredQuestions,
        method,
        provider,
        model,
      })
      .returning();

    const savedRequirements = await db
      .insert(analysisRequirementsTable)
      .values(
        requirements.map((requirement) => ({
          analysisId: analysis!.id,
          category: requirement.category,
          text: requirement.text,
          claimKind: requirement.claimKind,
          source: requirement.source,
          origin: requirement.origin ?? null,
        })),
      )
      .returning();

    res.status(201).json({
      analysis,
      requirements: savedRequirements,
      grouped: groupRequirements(
        savedRequirements.map((item) => ({
          category: item.category as never,
          text: item.text,
          claimKind: item.claimKind as ClaimKind,
          source: item.source as never,
          origin: item.origin ?? undefined,
        })),
      ),
      note: aiNote,
    });
  },
);

router.get(
  "/competitions/:competitionId/analysis",
  async (req, res): Promise<void> => {
    const params = GetAnalysisParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [analysis] = await db
      .select()
      .from(competitionAnalysesTable)
      .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
      .orderBy(desc(competitionAnalysesTable.version))
      .limit(1);

    if (!analysis) {
      res.json({ analysis: null, requirements: [], grouped: [] });
      return;
    }

    const requirements = await db
      .select()
      .from(analysisRequirementsTable)
      .where(eq(analysisRequirementsTable.analysisId, analysis.id));

    res.json({ analysis, requirements });
  },
);

router.patch(
  "/competitions/:competitionId/analysis/requirements/:requirementId",
  async (req, res): Promise<void> => {
    const params = UpdateRequirementParams.safeParse(req.params);
    const parsed = UpdateRequirementBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid requirement update." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const trimmedText = parsed.data.text.trim();
    if (!trimmedText) {
      res.status(400).json({ error: "A requirement needs text." });
      return;
    }

    const [updated] = await db
      .update(analysisRequirementsTable)
      .set({ text: trimmedText, reviewed: parsed.data.reviewed })
      .where(
        and(
          eq(analysisRequirementsTable.id, params.data.requirementId),
          eq(
            analysisRequirementsTable.analysisId,
            db
              .select({ id: competitionAnalysesTable.id })
              .from(competitionAnalysesTable)
              .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
              .limit(1) as never,
          ),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Requirement not found." });
      return;
    }

    res.json({ requirement: updated });
  },
);

// --- research -----------------------------------------------------------

router.post(
  "/competitions/:competitionId/research",
  async (req, res): Promise<void> => {
    const params = CreateResearchParams.safeParse(req.params);
    const parsed = CreateResearchBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid research request." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const data = parsed.data;

    // A finding the user recorded by hand. This branch is checked first
    // because a manual finding has no search query.
    if (data.manual === true) {
      const title = data.title?.trim() ?? "";
      const summary = data.summary?.trim() ?? "";
      const sourceUrl = data.sourceUrl?.trim() ?? "";
      if (!title || !summary) {
        res.status(400).json({
          error: "A manual finding needs a title and a summary.",
        });
        return;
      }
      if (sourceUrl && !isHttpUrl(sourceUrl)) {
        res.status(400).json({ error: "The source URL must be an http or https URL." });
        return;
      }

      const [created] = await db
        .insert(researchFindingsTable)
        .values({
          competitionId: params.data.competitionId,
          title,
          summary,
          sourceUrl: sourceUrl || null,
          provider: "manual",
          sourceType: normaliseResearchSourceType(data.sourceType),
          claimKind: "SOURCE_SUPPORTED",
          supports: data.supports ?? null,
          limitations: data.limitations ?? null,
          excerpt: data.excerpt ?? null,
          manual: true,
        })
        .returning();

      res.status(201).json({ finding: created, providerOutcomes: [] });
      return;
    }

    if (researchRateLimited()) {
      res.status(429).json({
        error:
          "Too many research searches in a short time. Wait a minute and try again.",
        code: "RATE_LIMITED",
      });
      return;
    }

    const query = data.query?.trim() ?? "";
    if (query.length < 3) {
      res
        .status(400)
        .json({ error: "A research query needs at least three characters." });
      return;
    }
    if (query.length > 300) {
      res.status(400).json({ error: "That research query is too long." });
      return;
    }

    const requested = Array.isArray(data.providers)
      ? data.providers.filter((provider) =>
          (RESEARCH_PROVIDERS as readonly string[]).includes(provider),
        )
      : [...RESEARCH_PROVIDERS];

    const search = await runResearchSearch(query, { providers: requested });

    const saved = await db
      .insert(researchFindingsTable)
      .values(
        search.outcomes.flatMap((outcome) =>
          outcome.results.map((result) => ({
            competitionId: params.data.competitionId,
            title: result.title,
            sourceUrl: result.url,
            provider: result.provider,
            sourceType: result.sourceType,
            retrievedAt: new Date(search.retrievedAt),
            summary: result.excerpt || result.title,
            excerpt: result.excerpt,
            claimKind: "SOURCE_SUPPORTED" as const,
            query,
            manual: false,
          })),
        ),
      )
      .returning();

    res.status(201).json({
      findings: saved,
      providerOutcomes: search.outcomes.map((outcome) => ({
        provider: outcome.provider,
        ok: outcome.ok,
        count: outcome.results.length,
        error: outcome.error ?? null,
      })),
      retrievedAt: search.retrievedAt,
    });
  },
);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

router.get(
  "/competitions/:competitionId/research",
  async (req, res): Promise<void> => {
    const params = ListResearchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const findings = await db
      .select()
      .from(researchFindingsTable)
      .where(eq(researchFindingsTable.competitionId, params.data.competitionId))
      .orderBy(desc(researchFindingsTable.retrievedAt));

    res.json({ findings });
  },
);

router.delete(
  "/competitions/:competitionId/research/:findingId",
  async (req, res): Promise<void> => {
    const params = DeleteResearchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid finding ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [deleted] = await db
      .delete(researchFindingsTable)
      .where(
        and(
          eq(researchFindingsTable.id, params.data.findingId),
          eq(researchFindingsTable.competitionId, params.data.competitionId),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Finding not found." });
      return;
    }

    res.json({ id: deleted.id, deleted: true });
  },
);

// --- gap analysis -------------------------------------------------------

router.post(
  "/competitions/:competitionId/gaps",
  async (req, res): Promise<void> => {
    const params = CreateGapsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const findings = await db
      .select()
      .from(researchFindingsTable)
      .where(eq(researchFindingsTable.competitionId, params.data.competitionId));

    const [analysis] = await db
      .select()
      .from(competitionAnalysesTable)
      .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
      .orderBy(desc(competitionAnalysesTable.version))
      .limit(1);

    const requirements = analysis
      ? await db
          .select()
          .from(analysisRequirementsTable)
          .where(eq(analysisRequirementsTable.analysisId, analysis.id))
      : [];

    const brief: CompetitionBrief = briefFromCompetition(competition);
    const deterministic = buildDeterministicGaps({
      findings: findings.map((finding) => ({
        id: finding.id,
        title: finding.title,
        url: finding.sourceUrl,
        claimKind: finding.claimKind as ClaimKind,
        supports: finding.supports ?? finding.summary,
      })),
      requirements: requirements.map((requirement) => ({
        category: normaliseRequirementCategory(requirement.category),
        text: requirement.text,
        claimKind: requirement.claimKind as ClaimKind,
        source: requirement.source as never,
      })),
      brief,
    });

    let gaps = deterministic.gaps;
    let method: "DETERMINISTIC" | "AI_ASSISTED" = "DETERMINISTIC";
    let provider: string | undefined;
    let model: string | undefined;
    let note: string | null = null;

    const providerInstance = currentAiProvider();
    if (providerInstance) {
      try {
        const completion = await providerInstance.completeJson({
          purpose: "gap analysis",
          system: [
            "You identify product opportunities from research findings and a competition brief.",
            "Answer with a single JSON object and nothing else.",
            "Never claim a competitor does not exist. Only describe what the provided sources actually show.",
            "A gap with no supporting finding must be claimKind HYPOTHESIS.",
            'Response shape: {"gaps":[{"need":"","targetUser":"","existingApproaches":"","insufficiency":"","opportunity":"","risks":[],"claimKind":"INFERENCE|HYPOTHESIS|SOURCE_SUPPORTED","supportingFindingIds":[]}]}',
          ].join(" "),
          user: [
            "Competition:",
            `Name: ${brief.name}`,
            `Problem statement: ${brief.problemStatement ?? "not recorded"}`,
            "",
            "Requirements already established:",
            ...requirements.map(
              (requirement) =>
                `- [${requirement.claimKind}] ${requirement.text}`,
            ),
            "",
            "Research findings:",
            ...findings.map(
              (finding) =>
                `- (${finding.id}) ${finding.title} — ${finding.summary} — ${finding.sourceUrl ?? "no url"}`,
            ),
            "",
            "List the opportunities this evidence supports.",
          ].join("\n"),
        });

        gaps = mergeAiGaps(deterministic.gaps, completion.data.gaps);
        method = "AI_ASSISTED";
        provider = completion.provider;
        model = completion.model;
      } catch (error) {
        note = aiErrorResponse(error).body.error;
      }
    } else {
      note =
        "No AI provider is configured, so the gaps below are the conservative pass built from your research findings only.";
    }

    const saved = await db
      .insert(researchGapsTable)
      .values(
        gaps.map((gap) => ({
          competitionId: params.data.competitionId,
          need: gap.need,
          targetUser: gap.targetUser,
          supportingFindingIds: gap.supportingFindingIds,
          existingApproaches: gap.existingApproaches,
          insufficiency: gap.insufficiency,
          opportunity: gap.opportunity,
          risks: gap.risks,
          claimKind: gap.claimKind,
          evidenceGaps: deterministic.evidenceGaps,
          nextInvestigations: deterministic.nextInvestigations,
        })),
      )
      .returning();

    res.status(201).json({
      gaps: saved,
      evidenceGaps: deterministic.evidenceGaps,
      nextInvestigations: deterministic.nextInvestigations,
      method,
      provider,
      model,
      note,
    });
  },
);

router.get(
  "/competitions/:competitionId/gaps",
  async (req, res): Promise<void> => {
    const params = ListGapsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const gaps = await db
      .select()
      .from(researchGapsTable)
      .where(eq(researchGapsTable.competitionId, params.data.competitionId))
      .orderBy(desc(researchGapsTable.createdAt));

    res.json({ gaps });
  },
);

// --- idea generation ----------------------------------------------------

router.post(
  "/competitions/:competitionId/ideas",
  async (req, res): Promise<void> => {
    const params = CreateIdeasParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const brief: CompetitionBrief = briefFromCompetition(competition);
    const hoursRemaining = Math.max(
      0,
      Math.floor(
        (new Date(brief.deadline).getTime() - Date.now()) / 3_600_000,
      ),
    );

    const [analysis] = await db
      .select()
      .from(competitionAnalysesTable)
      .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
      .orderBy(desc(competitionAnalysesTable.version))
      .limit(1);

    const requirements = analysis
      ? await db
          .select()
          .from(analysisRequirementsTable)
          .where(eq(analysisRequirementsTable.analysisId, analysis.id))
      : [];

    const findings = await db
      .select()
      .from(researchFindingsTable)
      .where(eq(researchFindingsTable.competitionId, params.data.competitionId));

    const providerInstance = currentAiProvider();
    if (!providerInstance) {
      const notConfigured = aiNotConfiguredResponse();
      res.status(notConfigured.status).json({
        ...notConfigured.body,
        context: {
          hoursRemaining,
          teamSize: brief.teamSize,
          teamSkills: brief.teamSkills,
          requirementCount: requirements.length,
          findingCount: findings.length,
        },
      });
      return;
    }

    if (aiRateLimited()) {
      res.status(429).json({
        error:
          "Too many generation requests in a short time. Wait a minute and try again.",
        code: "RATE_LIMITED",
      });
      return;
    }

    let ideas: IdeaCandidate[] = [];
    let provider: string | undefined;
    let model: string | undefined;

    try {
      const completion = await providerInstance.completeJson({
          purpose: "idea generation",
          system: [
          "You propose buildable product ideas for a hackathon team.",
          "Answer with a single JSON object and nothing else.",
          `The team has about ${hoursRemaining} hours and ${brief.teamSize} builders. Never propose more than fits.`,
          "Ideas must be genuinely different from one another, not variations of the same concept.",
          "Every idea must state what is excluded from the MVP and what is still unverified.",
          'Response shape: {"ideas":[{"name":"","pitch":"","targetUser":"","problemSolved":"","proposedSolution":"","differentiator":"","coreUserJourney":"","mvpFeatures":[],"excludedFeatures":[],"architectureSuggestion":"","dataAndIntegrations":"","feasibilityNote":"","risks":[],"demoStrategy":"","supportingEvidence":[],"unverifiedAssumptions":[],"claimKind":"INFERENCE|HYPOTHESIS"}]}',
        ].join(" "),
        user: [
          "Competition:",
          `Name: ${brief.name}`,
          `Deadline: ${new Date(brief.deadline).toISOString()}`,
          `Hours remaining: ${hoursRemaining}`,
          `Team size: ${brief.teamSize}`,
          `Team skills: ${brief.teamSkills.join(", ") || "not recorded"}`,
          `Mandatory deliverables: ${brief.mandatoryDeliverables.join("; ") || "not recorded"}`,
          `Problem statement: ${brief.problemStatement ?? "not recorded"}`,
          "",
          "Established requirements:",
          ...requirements.map(
            (requirement) =>
              `- [${requirement.claimKind}] (${requirement.category}) ${requirement.text}`,
          ),
          "",
          "Research findings:",
          ...findings.map(
            (finding) =>
              `- (${finding.id}) ${finding.title} — ${finding.summary}`,
          ),
          "",
          "Propose distinct ideas that fit the time and the team.",
        ].join("\n"),
      });

      ideas = dedupeIdeas(parseModelIdeas(completion.data.ideas));
      provider = completion.provider;
      model = completion.model;
    } catch (error) {
      const failure = aiErrorResponse(error);
      res.status(failure.status).json(failure.body);
      return;
    }

    const saved = await db
      .insert(ideaCandidatesTable)
      .values(
        ideas.map((idea) => ({
          competitionId: params.data.competitionId,
          name: idea.name,
          pitch: idea.pitch,
          targetUser: idea.targetUser,
          problemSolved: idea.problemSolved,
          proposedSolution: idea.proposedSolution,
          differentiator: idea.differentiator,
          coreUserJourney: idea.coreUserJourney,
          mvpFeatures: idea.mvpFeatures,
          excludedFeatures: idea.excludedFeatures,
          architectureSuggestion: idea.architectureSuggestion,
          dataAndIntegrations: idea.dataAndIntegrations,
          feasibilityNote: idea.feasibilityNote,
          risks: idea.risks,
          demoStrategy: idea.demoStrategy,
          supportingEvidence: idea.supportingEvidence,
          unverifiedAssumptions: idea.unverifiedAssumptions,
          claimKind: idea.claimKind,
        })),
      )
      .returning();

    res.status(201).json({ ideas: saved, provider, model });
  },
);

router.get(
  "/competitions/:competitionId/ideas",
  async (req, res): Promise<void> => {
    const params = ListIdeasParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const ideas = await db
      .select()
      .from(ideaCandidatesTable)
      .where(eq(ideaCandidatesTable.competitionId, params.data.competitionId))
      .orderBy(desc(ideaCandidatesTable.createdAt));

    const rubric = await db
      .select()
      .from(ideaRubricsTable)
      .where(eq(ideaRubricsTable.competitionId, params.data.competitionId))
      .limit(1);

    const evaluations = ideas.length
      ? await db
          .select()
          .from(ideaEvaluationsTable)
          .where(
            inArray(
              ideaEvaluationsTable.ideaId,
              ideas.map((idea) => idea.id),
            ),
          )
      : [];

    const weights = normaliseWeights(
      (rubric[0]?.weights as Record<string, number> | undefined) ?? undefined,
    );

    const evaluated = ideas.map((idea) => {
      const scores: DimensionScore[] = evaluations
        .filter((evaluation) => evaluation.ideaId === idea.id)
        .map((evaluation) => ({
          dimension: evaluation.dimension as IdeaDimension,
          score: evaluation.score,
          rationale: evaluation.rationale,
          evidenceRefs: evaluation.evidenceRefs,
          uncertainties: evaluation.uncertainties,
          confidence: evaluation.confidence as "LOW" | "MEDIUM" | "HIGH",
        }));
      return {
        ideaId: idea.id,
        name: idea.name,
        evaluation: evaluateIdea(idea.id, scores, weights),
      };
    });

    res.json({
      ideas,
      weights,
      comparison: compareIdeas(evaluated),
    });
  },
);

router.post(
  "/competitions/:competitionId/ideas/:ideaId/evaluate",
  async (req, res): Promise<void> => {
    const params = EvaluateIdeaParams.safeParse(req.params);
    const parsed = EvaluateIdeaBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: "Invalid evaluation request.", code: "INVALID_PARAMS" });
      return;
    }
    if (!parsed.success) {
      // Check if the error is specifically about invalid scores
      const hasScoreError = parsed.error.issues.some(
        (issue) => issue.path.includes("score") && issue.path.includes("scores")
      );
      if (hasScoreError) {
        res.status(400).json({
          error: "No scores could be produced. Score the idea by hand, or configure an AI provider.",
          code: "NO_SCORES",
        });
        return;
      }
      res.status(400).json({ error: "Invalid evaluation request.", code: "INVALID_BODY" });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [idea] = await db
      .select()
      .from(ideaCandidatesTable)
      .where(
        and(
          eq(ideaCandidatesTable.id, params.data.ideaId),
          eq(ideaCandidatesTable.competitionId, params.data.competitionId),
        ),
      )
      .limit(1);

    if (!idea) {
      res.status(404).json({ error: "Idea not found." });
      return;
    }

    const provided = parsed.data.scores;
    const rubric = await db
      .select()
      .from(ideaRubricsTable)
      .where(eq(ideaRubricsTable.competitionId, params.data.competitionId))
      .limit(1);

    const weights = normaliseWeights(
      (rubric[0]?.weights as Record<string, number> | undefined) ?? undefined,
    );

    // Manual scores the user typed in.
    const manualScores: DimensionScore[] = [];
    for (const entry of provided) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const dimension = String(record.dimension ?? "").toUpperCase();
      if (!(IDEA_DIMENSIONS as readonly string[]).includes(dimension)) continue;
      const numeric = Number(record.score);
      if (!Number.isFinite(numeric)) continue;
      manualScores.push({
        dimension: dimension as IdeaDimension,
        score: Math.min(5, Math.max(1, numeric)),
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
          String(record.confidence ?? "MEDIUM").toUpperCase() === "LOW"
            ? "LOW"
            : String(record.confidence ?? "MEDIUM").toUpperCase() === "HIGH"
              ? "HIGH"
              : "MEDIUM",
      });
    }

    let scores = manualScores;
    let provider: string | undefined;
    let model: string | undefined;

    // Model-proposed scores, used when the user has not scored this idea.
    if (scores.length === 0) {
      const providerInstance = currentAiProvider();
      if (providerInstance) {
        try {
          const completion = await providerInstance.completeJson({
          purpose: "idea evaluation",
          system: [
              "You evaluate a hackathon product idea on a fixed rubric.",
              "Answer with a single JSON object and nothing else.",
              "Score each dimension from 1 (worst) to 5 (best). Give a reason for every score.",
              "Do not predict a win. These are the team's own judgements, not an outcome.",
              'Response shape: {"scores":[{"dimension":"PROBLEM_RELEVANCE|JUDGING_ALIGNMENT|USER_VALUE|DIFFERENTIATION|TECHNICAL_FEASIBILITY|DEMONSTRABILITY|IMPLEMENTATION_TIME|RELIABILITY_RISK|DATA_AVAILABILITY|POTENTIAL_IMPACT","score":1,"rationale":"","evidenceRefs":[],"uncertainties":[],"confidence":"LOW|MEDIUM|HIGH"}]}',
            ].join(" "),
            user: [
              "Idea:",
              `Name: ${idea.name}`,
              `Pitch: ${idea.pitch}`,
              `Target user: ${idea.targetUser}`,
              `Problem solved: ${idea.problemSolved}`,
              `Solution: ${idea.proposedSolution}`,
              `Differentiator: ${idea.differentiator}`,
              `MVP: ${idea.mvpFeatures.join("; ") || "not recorded"}`,
              `Excluded from MVP: ${idea.excludedFeatures.join("; ") || "not recorded"}`,
              `Unverified assumptions: ${idea.unverifiedAssumptions.join("; ") || "none recorded"}`,
              "",
              `Available time: about ${Math.max(0, Math.floor((new Date(competition.deadline).getTime() - Date.now()) / 3_600_000))} hours with ${competition.teamSize} builders.`,
              "",
              "Score the idea on every dimension.",
            ].join("\n"),
          });
          scores = parseModelScores(completion.data.scores);
          provider = completion.provider;
          model = completion.model;
        } catch (error) {
          const failure = aiErrorResponse(error);
          res.status(failure.status).json(failure.body);
          return;
        }
      }
    }

    if (scores.length === 0) {
      res.status(400).json({
        error:
          "No scores could be produced. Score the idea by hand, or configure an AI provider.",
        code: "NO_SCORES",
      });
      return;
    }

    // Replace the stored scores for this idea.
    await db
      .delete(ideaEvaluationsTable)
      .where(eq(ideaEvaluationsTable.ideaId, idea.id));

    await db.insert(ideaEvaluationsTable).values(
      scores.map((score) => ({
        ideaId: idea.id,
        dimension: score.dimension,
        score: score.score,
        weight: Math.round(weights[score.dimension] * 1000),
        rationale: score.rationale,
        evidenceRefs: score.evidenceRefs,
        uncertainties: score.uncertainties,
        confidence: score.confidence,
      })),
    );

    const evaluation = evaluateIdea(idea.id, scores, weights);

    res.json({ evaluation, provider, model });
  },
);

router.put(
  "/competitions/:competitionId/rubric",
  async (req, res): Promise<void> => {
    const params = SaveRubricParams.safeParse(req.params);
    const parsed = SaveRubricBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid rubric request." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const weights = normaliseWeights(parsed.data.weights);

    const [saved] = await db
      .insert(ideaRubricsTable)
      .values({
        competitionId: params.data.competitionId,
        weights: weights as never,
      })
      .onConflictDoUpdate({
        target: ideaRubricsTable.competitionId,
        set: { weights: weights as never },
      })
      .returning();

    res.json({ rubric: saved, weights, defaults: DEFAULT_IDEA_WEIGHTS });
  },
);

router.post(
  "/competitions/:competitionId/ideas/:ideaId/decision",
  async (req, res): Promise<void> => {
    const params = DecideIdeaParams.safeParse(req.params);
    const parsed = DecideIdeaBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid decision request." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [updated] = await db
      .update(ideaCandidatesTable)
      .set({ status: parsed.data.status, decisionRationale: parsed.data.rationale })
      .where(
        and(
          eq(ideaCandidatesTable.id, params.data.ideaId),
          eq(ideaCandidatesTable.competitionId, params.data.competitionId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Idea not found." });
      return;
    }

    res.json({ idea: updated });
  },
);

// --- build brief --------------------------------------------------------

router.post(
  "/competitions/:competitionId/ideas/:ideaId/brief",
  async (req, res): Promise<void> => {
    const ownerId = res.locals.userId as string;

    // Validate competitionId first to check ownership before validating ideaId
    const competitionIdResult = CreateBriefParams.shape.competitionId.safeParse(req.params.competitionId);
    if (!competitionIdResult.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }

    const competition = await requireCompetition(competitionIdResult.data, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    // Now validate the full params including ideaId
    const params = CreateBriefParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid brief request." });
      return;
    }

    const [idea] = await db
      .select()
      .from(ideaCandidatesTable)
      .where(
        and(
          eq(ideaCandidatesTable.id, params.data.ideaId),
          eq(ideaCandidatesTable.competitionId, params.data.competitionId),
        ),
      )
      .limit(1);

    if (!idea) {
      res.status(404).json({ error: "Idea not found." });
      return;
    }

    const candidate: IdeaCandidate = {
      name: idea.name,
      pitch: idea.pitch,
      targetUser: idea.targetUser,
      problemSolved: idea.problemSolved,
      proposedSolution: idea.proposedSolution,
      differentiator: idea.differentiator,
      coreUserJourney: idea.coreUserJourney,
      mvpFeatures: idea.mvpFeatures,
      excludedFeatures: idea.excludedFeatures,
      architectureSuggestion: idea.architectureSuggestion,
      dataAndIntegrations: idea.dataAndIntegrations,
      feasibilityNote: idea.feasibilityNote,
      risks: idea.risks,
      demoStrategy: idea.demoStrategy,
      supportingEvidence: idea.supportingEvidence,
      unverifiedAssumptions: idea.unverifiedAssumptions,
      claimKind: idea.claimKind as ClaimKind,
    };

    const brief: CompetitionBrief = briefFromCompetition(competition);
    const [analysis] = await db
      .select()
      .from(competitionAnalysesTable)
      .where(eq(competitionAnalysesTable.competitionId, params.data.competitionId))
      .orderBy(desc(competitionAnalysesTable.version))
      .limit(1);

    const requirements = analysis
      ? await db
          .select()
          .from(analysisRequirementsTable)
          .where(eq(analysisRequirementsTable.analysisId, analysis.id))
      : [];

    let parsed = buildBriefFromIdea(candidate);
    let method = "DETERMINISTIC";
    let provider: string | undefined;
    let model: string | undefined;

    const providerInstance = currentAiProvider();
    if (providerInstance) {
      if (aiRateLimited()) {
        res.status(429).json({
          error:
            "Too many generation requests in a short time. Wait a minute and try again.",
          code: "RATE_LIMITED",
        });
        return;
      }
      try {
        const prompt = buildBriefPrompt(
          brief,
          candidate,
          requirements.map((requirement) => ({
            category: normaliseRequirementCategory(requirement.category),
            text: requirement.text,
            claimKind: requirement.claimKind as ClaimKind,
            source: requirement.source as never,
          })),
        );
        const completion = await providerInstance.completeJson({
          ...prompt,
          purpose: "build brief",
        });
        parsed = parseModelBuildBrief(completion.data, candidate);
        method = "AI_ASSISTED";
        provider = completion.provider;
        model = completion.model;
      } catch (error) {
        // The brief built from the idea alone is still saved, with a note.
        const failure = aiErrorResponse(error);
        const saved = await persistBrief(
          params.data.competitionId,
          idea.id,
          parsed.brief,
          parsed.missingSections,
          "DETERMINISTIC",
        );
        res.status(201).json({
          brief: saved,
          missingSections: parsed.missingSections,
          method: "DETERMINISTIC",
          note: failure.body.error,
        });
        return;
      }
    }

    const saved = await persistBrief(
      params.data.competitionId,
      idea.id,
      parsed.brief,
      parsed.missingSections,
      method,
      provider,
      model,
    );

    res.status(201).json({
      brief: saved,
      missingSections: parsed.missingSections,
      method,
      provider,
      model,
    });
  },
);

async function persistBrief(
  competitionId: string,
  ideaId: string,
  brief: BuildBrief,
  missingSections: string[],
  method: string,
  provider?: string,
  model?: string,
) {
  const [saved] = await db
    .insert(buildBriefsTable)
    .values({
      competitionId,
      ideaId,
      ideaName: brief.ideaName,
      content: brief as never,
      missingSections,
      claimKind: brief.claimKind,
      method,
      provider: provider ?? null,
      model: model ?? null,
    })
    .returning();

  return saved;
}

router.get(
  "/competitions/:competitionId/briefs",
  async (req, res): Promise<void> => {
    const params = ListBriefsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }
    const ownerId = res.locals.userId as string;

    const competition = await requireCompetition(params.data.competitionId, ownerId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const briefs = await db
      .select()
      .from(buildBriefsTable)
      .where(eq(buildBriefsTable.competitionId, params.data.competitionId))
      .orderBy(desc(buildBriefsTable.createdAt));

    res.json({ briefs });
  },
);

export default router;
