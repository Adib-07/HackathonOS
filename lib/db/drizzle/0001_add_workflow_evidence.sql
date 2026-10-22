CREATE TABLE "workflow_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"task_id" uuid,
	"task_key" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"source_url" text,
	"command_name" text,
	"result" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"reviewer_note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"phase_snapshot" text NOT NULL,
	"verification_method_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_evidence" ADD CONSTRAINT "workflow_evidence_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_evidence" ADD CONSTRAINT "workflow_evidence_task_id_workflow_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."workflow_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_evidence_competition_task_idx" ON "workflow_evidence" USING btree ("competition_id","task_key");--> statement-breakpoint
CREATE INDEX "workflow_evidence_competition_idx" ON "workflow_evidence" USING btree ("competition_id");