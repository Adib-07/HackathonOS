import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { competitionsTable } from "./competitions";

export const workflowPlansTable = pgTable(
  "workflow_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    availableMinutes: integer("available_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull(),
    status: text("status").notNull(),
    warnings: text("warnings")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    trigger: text("trigger").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_plans_competition_version_unique").on(
      table.competitionId,
      table.version,
    ),
    index("workflow_plans_competition_generated_idx").on(
      table.competitionId,
      table.generatedAt,
    ),
  ],
);

export const workflowTasksTable = pgTable(
  "workflow_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => workflowPlansTable.id, { onDelete: "cascade" }),
    taskKey: text("task_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    phase: text("phase").notNull(),
    priority: text("priority").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    plannedStartAt: timestamp("planned_start_at", {
      withTimezone: true,
    }).notNull(),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }).notNull(),
    dependencies: text("dependencies")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    owner: text("owner"),
    status: text("status").notNull().default("todo"),
    acceptanceCriteria: text("acceptance_criteria")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    expectedArtifact: text("expected_artifact"),
    verificationMethod: text("verification_method").notNull(),
    riskIfSkipped: text("risk_if_skipped").notNull(),
    mandatory: boolean("mandatory").notNull().default(false),
  },
  (table) => [
    index("workflow_tasks_plan_order_idx").on(
      table.planId,
      table.plannedStartAt,
    ),
    index("workflow_tasks_competition_idx").on(table.competitionId),
  ],
);

export const insertWorkflowPlanSchema = createInsertSchema(
  workflowPlansTable,
).omit({ id: true, generatedAt: true });

export const insertWorkflowTaskSchema = createInsertSchema(
  workflowTasksTable,
).omit({ id: true });

export type InsertWorkflowPlan = z.infer<typeof insertWorkflowPlanSchema>;
export type WorkflowPlanRecord = typeof workflowPlansTable.$inferSelect;
export type InsertWorkflowTask = z.infer<typeof insertWorkflowTaskSchema>;
export type WorkflowTaskRecord = typeof workflowTasksTable.$inferSelect;
