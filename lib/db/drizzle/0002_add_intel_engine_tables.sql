CREATE TABLE "analysis_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"category" text NOT NULL,
	"text" text NOT NULL,
	"claim_kind" text DEFAULT 'INFERENCE' NOT NULL,
	"source" text DEFAULT 'AI_INFERENCE' NOT NULL,
	"origin" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"idea_id" uuid,
	"idea_name" text NOT NULL,
	"content" jsonb NOT NULL,
	"missing_sections" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"claim_kind" text DEFAULT 'INFERENCE' NOT NULL,
	"method" text DEFAULT 'DETERMINISTIC' NOT NULL,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"core_problem" text NOT NULL,
	"missing_fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"unanswered_questions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"method" text DEFAULT 'DETERMINISTIC' NOT NULL,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pitch" text NOT NULL,
	"target_user" text NOT NULL,
	"problem_solved" text NOT NULL,
	"proposed_solution" text NOT NULL,
	"differentiator" text NOT NULL,
	"core_user_journey" text NOT NULL,
	"mvp_features" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"excluded_features" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"architecture_suggestion" text NOT NULL,
	"data_and_integrations" text NOT NULL,
	"feasibility_note" text NOT NULL,
	"risks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"demo_strategy" text NOT NULL,
	"supporting_evidence" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"unverified_assumptions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"claim_kind" text DEFAULT 'INFERENCE' NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"decision_rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"evidence_refs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"uncertainties" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"confidence" text DEFAULT 'MEDIUM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"weights" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"provider" text NOT NULL,
	"source_type" text DEFAULT 'TECHNICAL_APPROACH' NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL,
	"excerpt" text,
	"supports" text,
	"limitations" text,
	"claim_kind" text DEFAULT 'SOURCE_SUPPORTED' NOT NULL,
	"query" text,
	"manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"need" text NOT NULL,
	"target_user" text NOT NULL,
	"supporting_finding_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"existing_approaches" text NOT NULL,
	"insufficiency" text NOT NULL,
	"opportunity" text NOT NULL,
	"risks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"claim_kind" text DEFAULT 'HYPOTHESIS' NOT NULL,
	"evidence_gaps" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"next_investigations" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_requirements" ADD CONSTRAINT "analysis_requirements_analysis_id_competition_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."competition_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_briefs" ADD CONSTRAINT "build_briefs_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_briefs" ADD CONSTRAINT "build_briefs_idea_id_idea_candidates_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_analyses" ADD CONSTRAINT "competition_analyses_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_candidates" ADD CONSTRAINT "idea_candidates_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_evaluations" ADD CONSTRAINT "idea_evaluations_idea_id_idea_candidates_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_rubrics" ADD CONSTRAINT "idea_rubrics_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_requirements_analysis_idx" ON "analysis_requirements" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "build_briefs_competition_idx" ON "build_briefs" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "build_briefs_idea_idx" ON "build_briefs" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "competition_analyses_competition_idx" ON "competition_analyses" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_analyses_competition_version_unique" ON "competition_analyses" USING btree ("competition_id","version");--> statement-breakpoint
CREATE INDEX "idea_candidates_competition_idx" ON "idea_candidates" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "idea_candidates_competition_status_idx" ON "idea_candidates" USING btree ("competition_id","status");--> statement-breakpoint
CREATE INDEX "idea_evaluations_idea_idx" ON "idea_evaluations" USING btree ("idea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_evaluations_idea_dimension_unique" ON "idea_evaluations" USING btree ("idea_id","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_rubrics_competition_unique" ON "idea_rubrics" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "research_findings_competition_idx" ON "research_findings" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "research_findings_competition_provider_idx" ON "research_findings" USING btree ("competition_id","provider");--> statement-breakpoint
CREATE INDEX "research_gaps_competition_idx" ON "research_gaps" USING btree ("competition_id");