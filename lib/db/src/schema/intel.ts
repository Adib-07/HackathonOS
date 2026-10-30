import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { competitionsTable } from "./competitions";

/**
 * The intelligence engine's persisted artefacts.
 *
 * Every table is scoped to a competition, and the competition is scoped to an
 * owner, so ownership is enforced with the same join the rest of the API
 * uses. Nothing here duplicates the competition record: the engine reads
 * that record at analysis time and stores only what it produced.
 */

/** A problem analysis of one competition. */
export const competitionAnalysesTable = pgTable(
  "competition_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    /** Increments each time the analysis is rerun. */
    version: integer("version").notNull().default(1),
    /** A short statement of the core problem. */
    coreProblem: text("core_problem").notNull(),
    /** Which fields the competition record does not contain. */
    missingFields: text("missing_fields")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** Questions the team still needs to answer. */
    unansweredQuestions: text("unanswered_questions")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** How the analysis was produced. */
    method: text("method").notNull().default("DETERMINISTIC"),
    /** Which provider produced the AI portion, when there was one. */
    provider: text("provider"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("competition_analyses_competition_idx").on(table.competitionId),
    uniqueIndex("competition_analyses_competition_version_unique").on(
      table.competitionId,
      table.version,
    ),
  ],
);

/** One extracted requirement. Editable by the user. */
export const analysisRequirementsTable = pgTable(
  "analysis_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => competitionAnalysesTable.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    text: text("text").notNull(),
    /** How well supported the requirement is. */
    claimKind: text("claim_kind").notNull().default("INFERENCE"),
    /** Where it came from. */
    source: text("source").notNull().default("AI_INFERENCE"),
    /** The stored competition field it came from, when it came from one. */
    origin: text("origin"),
    /** True when the user has accepted or rejected the requirement. */
    reviewed: boolean("reviewed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("analysis_requirements_analysis_idx").on(table.analysisId)],
);

/** A research finding, retrieved from a real source. */
export const researchFindingsTable = pgTable(
  "research_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The URL the finding came from. */
    sourceUrl: text("source_url"),
    /** Which provider returned it. */
    provider: text("provider").notNull(),
    /** The category of research this belongs to. */
    sourceType: text("source_type").notNull().default("TECHNICAL_APPROACH"),
    /** When the source was retrieved. */
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    summary: text("summary").notNull(),
    /** A short factual excerpt taken from the source. */
    excerpt: text("excerpt"),
    /** What the source supports. */
    supports: text("supports"),
    /** What the source does not establish. */
    limitations: text("limitations"),
    /** How well supported the finding is. */
    claimKind: text("claim_kind").notNull().default("SOURCE_SUPPORTED"),
    /** The query that produced the finding. */
    query: text("query"),
    /** True when the user entered the finding by hand. */
    manual: boolean("manual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("research_findings_competition_idx").on(table.competitionId),
    index("research_findings_competition_provider_idx").on(
      table.competitionId,
      table.provider,
    ),
  ],
);

/** An opportunity identified from the research and the analysis. */
export const researchGapsTable = pgTable(
  "research_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    need: text("need").notNull(),
    targetUser: text("target_user").notNull(),
    /** Findings that support this gap. */
    supportingFindingIds: text("supporting_finding_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    existingApproaches: text("existing_approaches").notNull(),
    insufficiency: text("insufficiency").notNull(),
    opportunity: text("opportunity").notNull(),
    risks: text("risks")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** How well supported the gap is. */
    claimKind: text("claim_kind").notNull().default("HYPOTHESIS"),
    /** Where the evidence runs out. */
    evidenceGaps: text("evidence_gaps")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** What the team should investigate next. */
    nextInvestigations: text("next_investigations")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("research_gaps_competition_idx").on(table.competitionId)],
);

/** A candidate product idea. */
export const ideaCandidatesTable = pgTable(
  "idea_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pitch: text("pitch").notNull(),
    targetUser: text("target_user").notNull(),
    problemSolved: text("problem_solved").notNull(),
    proposedSolution: text("proposed_solution").notNull(),
    differentiator: text("differentiator").notNull(),
    coreUserJourney: text("core_user_journey").notNull(),
    mvpFeatures: text("mvp_features")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    excludedFeatures: text("excluded_features")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    architectureSuggestion: text("architecture_suggestion").notNull(),
    dataAndIntegrations: text("data_and_integrations").notNull(),
    feasibilityNote: text("feasibility_note").notNull(),
    risks: text("risks")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    demoStrategy: text("demo_strategy").notNull(),
    supportingEvidence: text("supporting_evidence")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    unverifiedAssumptions: text("unverified_assumptions")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    claimKind: text("claim_kind").notNull().default("INFERENCE"),
    /** "candidate", "selected" or "rejected". */
    status: text("status").notNull().default("candidate"),
    /** The team's reason for the decision. */
    decisionRationale: text("decision_rationale"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idea_candidates_competition_idx").on(table.competitionId),
    index("idea_candidates_competition_status_idx").on(
      table.competitionId,
      table.status,
    ),
  ],
);

/** One dimension score for one idea. */
export const ideaEvaluationsTable = pgTable(
  "idea_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideaCandidatesTable.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull(),
    /** 1 (worst) to 5 (best). */
    score: integer("score").notNull(),
    /** The weight used at the time of scoring. */
    weight: integer("weight").notNull().default(0),
    rationale: text("rationale").notNull(),
    evidenceRefs: text("evidence_refs")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    uncertainties: text("uncertainties")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    confidence: text("confidence").notNull().default("MEDIUM"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idea_evaluations_idea_idx").on(table.ideaId),
    uniqueIndex("idea_evaluations_idea_dimension_unique").on(
      table.ideaId,
      table.dimension,
    ),
  ],
);

/** The weights a team used for a competition's rubric. */
export const ideaRubricsTable = pgTable(
  "idea_rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    /** Dimension weights, stored as thousandths of a percent so they are integers. */
    weights: jsonb("weights").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idea_rubrics_competition_unique").on(table.competitionId),
  ],
);

/** The build brief produced from a selected idea. */
export const buildBriefsTable = pgTable(
  "build_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => ideaCandidatesTable.id, {
      onDelete: "set null",
    }),
    ideaName: text("idea_name").notNull(),
    /** The brief itself, stored as a structured document. */
    content: jsonb("content").notNull(),
    /** Sections the brief could not fill. */
    missingSections: text("missing_sections")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** How well supported the brief's claims are. */
    claimKind: text("claim_kind").notNull().default("INFERENCE"),
    method: text("method").notNull().default("DETERMINISTIC"),
    provider: text("provider"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("build_briefs_competition_idx").on(table.competitionId),
    index("build_briefs_idea_idx").on(table.ideaId),
  ],
);

export const insertCompetitionAnalysisSchema = createInsertSchema(
  competitionAnalysesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAnalysisRequirementSchema = createInsertSchema(
  analysisRequirementsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertResearchFindingSchema = createInsertSchema(
  researchFindingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertResearchGapSchema = createInsertSchema(
  researchGapsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertIdeaCandidateSchema = createInsertSchema(
  ideaCandidatesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertIdeaEvaluationSchema = createInsertSchema(
  ideaEvaluationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertBuildBriefSchema = createInsertSchema(buildBriefsTable).omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  },
);

export type InsertCompetitionAnalysis = z.infer<
  typeof insertCompetitionAnalysisSchema
>;
export type CompetitionAnalysisRecord =
  typeof competitionAnalysesTable.$inferSelect;
export type AnalysisRequirementRecord =
  typeof analysisRequirementsTable.$inferSelect;
export type ResearchFindingRecord = typeof researchFindingsTable.$inferSelect;
export type ResearchGapRecord = typeof researchGapsTable.$inferSelect;
export type IdeaCandidateRecord = typeof ideaCandidatesTable.$inferSelect;
export type IdeaEvaluationRecord = typeof ideaEvaluationsTable.$inferSelect;
export type BuildBriefRecord = typeof buildBriefsTable.$inferSelect;
