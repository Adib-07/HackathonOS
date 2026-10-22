CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"organizer" text,
	"competition_type" text DEFAULT 'unknown' NOT NULL,
	"start_at" timestamp with time zone,
	"deadline" timestamp with time zone NOT NULL,
	"team_size" integer DEFAULT 1 NOT NULL,
	"track_mode" text DEFAULT 'choose' NOT NULL,
	"current_track" text,
	"problem_statement" text,
	"official_url" text,
	"rules_url" text,
	"mandatory_deliverables" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"team_skills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"idea_complexity" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"available_minutes" integer NOT NULL,
	"buffer_minutes" integer NOT NULL,
	"status" text NOT NULL,
	"warnings" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"trigger" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"phase" text NOT NULL,
	"priority" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"dependencies" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"owner" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"acceptance_criteria" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"expected_artifact" text,
	"verification_method" text NOT NULL,
	"risk_if_skipped" text NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_plans" ADD CONSTRAINT "workflow_plans_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_plan_id_workflow_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workflow_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitions_owner_deadline_idx" ON "competitions" USING btree ("owner_id","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_plans_competition_version_unique" ON "workflow_plans" USING btree ("competition_id","version");--> statement-breakpoint
CREATE INDEX "workflow_plans_competition_generated_idx" ON "workflow_plans" USING btree ("competition_id","generated_at");--> statement-breakpoint
CREATE INDEX "workflow_tasks_plan_order_idx" ON "workflow_tasks" USING btree ("plan_id","planned_start_at");--> statement-breakpoint
CREATE INDEX "workflow_tasks_competition_idx" ON "workflow_tasks" USING btree ("competition_id");